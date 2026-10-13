import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { LocalDate, Money, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { CashMovement, type MovementDetails } from '../domain/index.js';
import { PrismaCashMovementRepository } from './prisma-cash-movement.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaCashMovementRepository(ctx.database);
const row = (date: string, details: Partial<MovementDetails> = {}) =>
  CashMovement.record(crypto.randomUUID(), {
    date: LocalDate.parse(date),
    category: 'UNIT_PAYMENT',
    amount: Money.ofPesos(700),
    description: null,
    unit: UnitNumber.of(501),
    ...details,
  });

describe('PrismaCashMovementRepository', () => {
  it('finds the rows of a month by date, including its first and last day', async () => {
    await repository().save([
      row('2026-08-31'),
      row('2026-09-01'),
      row('2026-09-30', { category: 'GARBAGE', unit: null, amount: Money.ofPesos(150) }),
      row('2026-10-01'),
    ]);
    const september = await repository().findByMonth(YearMonth.of(2026, 9));
    expect(september.map((r) => `${r.date} ${r.category} ${r.amount}`)).toEqual([
      '2026-09-01 UNIT_PAYMENT 700.00',
      '2026-09-30 GARBAGE 150.00',
    ]);
  });

  it('round-trips revisions and keeps removed rows with their removal time', async () => {
    const payment = row('2026-09-03');
    const other = row('2026-09-04', {
      category: 'OTHER_EXPENSE',
      unit: null,
      description: 'Focos',
      amount: Money.ofPesos(95.5),
    });
    await repository().save([payment, other]);

    payment.revise({ amount: Money.ofPesos(1400) });
    other.remove();
    await repository().save([payment, other]);
    const firstRemoval = await ctx.database.client.cashMovement.findUnique({
      where: { id: other.id },
    });
    await repository().save([other]);
    const secondRemoval = await ctx.database.client.cashMovement.findUnique({
      where: { id: other.id },
    });
    expect(secondRemoval!.removedAt).toEqual(firstRemoval!.removedAt);

    const loaded = await repository().findByMonth(YearMonth.of(2026, 9));
    expect(loaded.map((r) => [r.amount.toString(), r.isRemoved, r.details.description])).toEqual([
      ['1400.00', false, null],
      ['95.50', true, 'Focos'],
    ]);
  });

  it('lists the live payments of one depto across months', async () => {
    const removed = row('2026-10-02');
    removed.remove();
    await repository().save([
      row('2026-09-03'),
      row('2026-10-02'),
      row('2026-10-02', { unit: UnitNumber.of(502) }),
      removed,
    ]);
    const payments = await repository().findPaymentsOf(UnitNumber.of(501));
    expect(payments.map((p) => String(p.date))).toEqual(['2026-09-03', '2026-10-02']);
  });

  it('enforces the category rules in the database itself', async () => {
    const insert = (data: {
      category: 'GARBAGE' | 'OTHER_EXPENSE';
      unitNumber?: number;
      description?: string;
    }) =>
      ctx.database.client.cashMovement.create({
        data: { id: crypto.randomUUID(), date: new Date('2026-09-01'), amount: 100, ...data },
      });
    await expect(insert({ category: 'GARBAGE', unitNumber: 501 })).rejects.toThrow(
      /unit_iff_payment|check/i,
    );
    await expect(insert({ category: 'OTHER_EXPENSE', description: '  ' })).rejects.toThrow(
      /description_required|check/i,
    );
  });
});
