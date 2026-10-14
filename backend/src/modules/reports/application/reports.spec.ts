import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { Money, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { expense, payment, pesos } from '../../cashbook/domain/testing.js';
import { admin, owner } from '../../shifts/application/testing.js';
import { booksFixture } from './testing.js';

const m = (text: string) => YearMonth.parse(text);
const start = { month: m('2026-08'), openingBalance: pesos(5000) };

// On 2 October 2026 502 holds October; 501 is in its handover days for September.

describe('reporting start', () => {
  it('is set by the superadmin, and audited', async () => {
    const fx = booksFixture('2026-10-02');

    await expect(fx.setStart.execute(owner(501), start)).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    await fx.setStart.execute(admin, start);

    expect(await fx.getStart.execute()).toEqual(start);
    expect(fx.audit.entries[0]?.change).toMatchObject({
      action: 'REPORTING_START_SET',
      changes: [
        { field: 'month', before: null, after: '2026-08' },
        { field: 'openingBalance', before: null, after: 500000 },
      ],
    });
  });

  it('keeps its month once a month is open, while the cash can still be corrected', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-08'));

    await expect(fx.setStart.execute(admin, { ...start, month: m('2026-09') })).rejects.toThrow(
      withCode('REPORTING_START_LOCKED'),
    );
    await fx.setStart.execute(admin, { ...start, openingBalance: pesos(5200) });
    expect(fx.audit.entries.at(-1)?.change.changes).toEqual([
      { field: 'openingBalance', before: 500000, after: 520000 },
    ]);
  });
});

describe('OpenMonth', () => {
  it('opens every month up to the one asked for, charging each its fees', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);

    const opened = await fx.open.execute(owner(502), m('2026-10'));

    expect(opened.map((report) => String(report.month))).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(fx.charges.summary()).toHaveLength(30);
    expect(fx.audit.actions.filter((a) => a === 'MONTH_OPENED')).toHaveLength(3);
    expect(await fx.open.execute(owner(502), m('2026-10'))).toEqual([]);
    expect(fx.charges.summary()).toHaveLength(30);
  });

  it('needs the books started, a month that has begun, and someone who can write it', async () => {
    const fx = booksFixture('2026-10-02');

    await expect(fx.open.execute(admin, m('2026-10'))).rejects.toThrow(
      withCode('REPORTING_NOT_STARTED'),
    );
    await fx.setStart.execute(admin, start);
    await expect(fx.open.execute(admin, m('2026-11'))).rejects.toThrow(
      withCode('MONTH_NOT_STARTED'),
    );
    await expect(fx.open.execute(admin, m('2026-07'))).rejects.toThrow(
      withCode('MONTH_BEFORE_START'),
    );
    await expect(fx.open.execute(owner(401), m('2026-10'))).rejects.toThrow(
      withCode('NOT_RESPONSIBLE'),
    );
  });
});

describe('GetMonthlyReport', () => {
  it('says the books have not started, with nothing to do but wait', async () => {
    const fx = booksFixture('2026-10-02');

    const view = await fx.view.execute(owner(502), m('2026-10'));

    expect(view).toMatchObject({
      status: 'NOT_OPENED',
      reportingStarted: false,
      balances: null,
      canOpen: false,
      canWrite: false,
    });
  });

  it('offers to open the month to whoever can write it', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);

    expect((await fx.view.execute(owner(502), m('2026-10'))).canOpen).toBe(true);
    expect((await fx.view.execute(owner(401), m('2026-10'))).canOpen).toBe(false);
    expect((await fx.view.execute(admin, m('2026-11'))).canOpen).toBe(false);
  });

  it('carries the balance through open months and shows what each payment covered', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-10'));
    await fx.add.execute(admin, payment('2026-08-05', 401, 700));
    await fx.add.execute(admin, expense('2026-09-10', 'GARBAGE', 150));
    await fx.add.execute(owner(502), payment('2026-10-03', 401, 1050));
    await fx.add.execute(owner(502), expense('2026-10-04', 'CLEANING', 270));

    const view = await fx.view.execute(owner(502), m('2026-10'));

    // 5,000 + 700 − 150 = 5,550 at the start of October; + 1,050 − 270 = 6,330.
    expect(view.balances).toEqual({ opening: pesos(5550), closing: pesos(6330) });
    expect(view.status).toBe('OPEN');
    expect(view.canWrite).toBe(true);
    expect(view.totals.income).toEqual(pesos(1050));
    const [paid] = view.rows;
    expect(paid?.coverage.map((c) => [String(c.month), c.amount.centavos, c.settles])).toEqual([
      ['2026-09', 70000, true],
      ['2026-10', 35000, false],
    ]);
    expect(view.suggestions?.cleaningPerVisit).toEqual(pesos(270));
    const account401 = view.accounts.find((a) => a.unit === UnitNumber.of(401));
    expect(account401?.outstandingBalance).toEqual(pesos(350));
    expect((await fx.view.execute(owner(401), m('2026-10'))).canWrite).toBe(false);
  });

  it('suggests the pending garbage weeks without counting them, and sums cleaning by week', async () => {
    const fx = booksFixture('2026-10-09');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-10'));
    await fx.add.execute(admin, expense('2026-09-29', 'CLEANING', 270));
    await fx.add.execute(owner(502), expense('2026-10-01', 'CLEANING', 270));

    const before = await fx.view.execute(owner(502), m('2026-10'));
    expect(before.garbageWeeks.map((w) => [String(w.week), w.status])).toEqual([
      ['2026-09-28', 'PENDING'],
      ['2026-10-05', 'PENDING'],
      ['2026-10-12', 'UPCOMING'],
      ['2026-10-19', 'UPCOMING'],
      ['2026-10-26', 'UPCOMING'],
    ]);
    expect(before.totals.byCategory.GARBAGE).toEqual(pesos(0));
    expect(before.cleaningPayouts.map((p) => [String(p.weekStart), p.total])).toEqual([
      ['2026-09-28', pesos(540)],
    ]);

    const [first] = before.garbageWeeks;
    await fx.add.execute(owner(502), {
      ...expense(String(first!.suggestedDate), 'GARBAGE', 150),
      week: first!.week,
    });
    const after = await fx.view.execute(owner(502), m('2026-10'));
    expect(after.garbageWeeks[0]?.status).toBe('PAID');
    expect(after.totals.byCategory.GARBAGE).toEqual(pesos(150));
  });

  it('works before any rate is in force', async () => {
    const fx = booksFixture('2026-10-02');

    expect((await fx.view.execute(admin, m('2026-01'))).suggestions).toBeNull();
  });
});

describe('GetAccounts', () => {
  it('adds up what each depto owes and has paid ahead', async () => {
    const fx = booksFixture('2026-10-02');
    await fx.setStart.execute(admin, start);
    await fx.open.execute(admin, m('2026-09'));
    await fx.add.execute(admin, payment('2026-09-05', 101, 2100));

    const accounts = await fx.accounts.all();
    const of = (unit: number) => accounts.find((a) => a.unit.value === unit)!;

    expect([of(101).outstandingBalance, of(101).creditBalance]).toEqual([Money.ZERO, pesos(700)]);
    expect(of(102).outstandingBalance).toEqual(pesos(1400));
    expect((await fx.accounts.of(UnitNumber.of(101))).lines).toHaveLength(2);
  });
});
