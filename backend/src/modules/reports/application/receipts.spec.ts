import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { expense, payment, pesos } from '../../cashbook/domain/testing.js';
import { admin, owner } from '../../shifts/application/testing.js';
import { booksFixture } from './testing.js';

const m = (text: string) => YearMonth.parse(text);
const money = (value: { toString(): string }) => String(value);

/**
 * The books start in September 2026; on 3 October both months are open and each charged
 * every depto its $700 fee. 502 holds October, so its owner records October's payments.
 */
async function october() {
  const fx = booksFixture('2026-10-03');
  await fx.setStart.execute(admin, { month: m('2026-09'), openingBalance: pesos(5000) });
  await fx.open.execute(admin, m('2026-10'));
  return fx;
}

const receiptOf = async (fx: Awaited<ReturnType<typeof october>>, id: string) => {
  await fx.accountDocuments.receipt(id);
  return fx.renderer.receipts.at(-1)!;
};

describe('a payment’s receipt', () => {
  it('lists the two months a payment covered, who recorded it and the account after it', async () => {
    const fx = await october();
    const { id } = await fx.add.execute(owner(502), payment('2026-10-03', 401, 1400));

    const receipt = await receiptOf(fx, id);

    expect(receipt.folio).toBe(1);
    expect(receipt.unit).toBe(UnitNumber.of(401));
    expect(receipt.covered.map((c) => [String(c.month), money(c.amount), c.settles])).toEqual([
      ['2026-09', '700.00', true],
      ['2026-10', '700.00', true],
    ]);
    expect(money(receipt.ahead)).toBe('0.00');
    expect(receipt.recordedBy).toEqual({ role: 'OWNER', unit: UnitNumber.of(502) });
    expect(money(receipt.balanceAfter.outstanding)).toBe('0.00');
    expect(money(receipt.balanceAfter.credit)).toBe('0.00');
    expect(receipt.monthOpen).toBe(true);
  });

  it('marks what a partial payment left owed', async () => {
    const fx = await october();
    const { id } = await fx.add.execute(owner(502), payment('2026-10-03', 302, 1000));

    const receipt = await receiptOf(fx, id);

    expect(receipt.covered.map((c) => [String(c.month), money(c.amount), c.settles])).toEqual([
      ['2026-09', '700.00', true],
      ['2026-10', '300.00', false],
    ]);
    expect(money(receipt.balanceAfter.outstanding)).toBe('400.00');
  });

  it('keeps an adelanto as paid ahead, even after later months charge their fees', async () => {
    const fx = await october();
    const { id } = await fx.add.execute(owner(502), payment('2026-10-03', 501, 2100));

    const before = await receiptOf(fx, id);
    fx.clock.advanceDays(30); // 2 November: November opens and charges its fee.
    await fx.open.execute(admin, m('2026-11'));
    const after = await receiptOf(fx, id);

    for (const receipt of [before, after]) {
      expect(receipt.covered.map((c) => String(c.month))).toEqual(['2026-09', '2026-10']);
      expect(money(receipt.ahead)).toBe('700.00');
      expect(money(receipt.balanceAfter.credit)).toBe('700.00');
    }
  });

  it('reads the account right after it, not counting later payments', async () => {
    const fx = await october();
    const first = await fx.add.execute(owner(502), payment('2026-10-01', 401, 700));
    await fx.add.execute(owner(502), payment('2026-10-03', 401, 700));

    const receipt = await receiptOf(fx, first.id);

    expect(money(receipt.balanceAfter.outstanding)).toBe('700.00');
  });

  it('numbers payments only, consecutively, and says when the month is closed', async () => {
    const fx = await october();
    const september = await fx.add.execute(admin, payment('2026-09-28', 101, 700));
    const cleaning = await fx.add.execute(admin, expense('2026-10-03', 'CLEANING', 270));
    const later = await fx.add.execute(owner(502), payment('2026-10-03', 102, 700));
    await fx.close.execute(admin, m('2026-09'));

    expect((await receiptOf(fx, september.id)).monthOpen).toBe(false);
    expect((await receiptOf(fx, later.id)).folio).toBe(2);
    await expect(fx.accountDocuments.receipt(cleaning.id)).rejects.toThrow(
      withCode('RECEIPT_NOT_FOUND'),
    );
  });

  it('has none for a removed payment', async () => {
    const fx = await october();
    const { id } = await fx.add.execute(owner(502), payment('2026-10-03', 401, 700));
    const row = (await fx.movements.findById(id))!;
    row.remove();
    await fx.movements.save([row]);

    await expect(fx.accountDocuments.receipt(id)).rejects.toThrow(withCode('RECEIPT_NOT_FOUND'));
  });
});

describe('an account statement', () => {
  it('shows the account today, or as a closed month ended', async () => {
    const fx = await october();
    await fx.add.execute(admin, payment('2026-09-10', 401, 700));
    await fx.add.execute(owner(502), payment('2026-10-03', 401, 300));
    await fx.close.execute(admin, m('2026-09'));

    await fx.accountDocuments.statement(UnitNumber.of(401));
    await fx.accountDocuments.statement(UnitNumber.of(401), m('2026-09'));
    const [today, september] = fx.renderer.statements;

    expect(String(today!.asOf)).toBe('2026-10-03');
    expect(today!.lines.map((l) => String(l.charge.month))).toEqual(['2026-09', '2026-10']);
    expect(today!.payments.map((p) => p.folio)).toEqual([1, 2]);
    expect(money(today!.balance.outstanding)).toBe('400.00');

    expect(String(september!.asOf)).toBe('2026-09-30');
    expect(september!.lines.map((l) => String(l.charge.month))).toEqual(['2026-09']);
    expect(september!.payments).toHaveLength(1);
    expect(money(september!.balance.outstanding)).toBe('0.00');
  });

  it('is only as of a closed month', async () => {
    const fx = await october();

    await expect(fx.accountDocuments.statement(UnitNumber.of(401), m('2026-10'))).rejects.toThrow(
      withCode('MONTH_NOT_CLOSED'),
    );
  });
});
