import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { YearMonth } from '../../../shared-kernel/index.js';
import { CashMovement } from './cash-movement.js';
import { MOVEMENT_CATEGORIES } from './movement-category.js';
import {
  assertNewVisits,
  assertWeekUnpaid,
  cleaningPayoutsOf,
  garbageSchedule,
  garbageWeeksOf,
  suggestedAmount,
  weeklyCleaningPayouts,
} from './recurring-expenses.js';
import { d, expense, garbage, payment, pesos } from './testing.js';

const october = YearMonth.of(2026, 10);

describe('suggestedAmount', () => {
  const rates = {
    maintenanceFee: pesos(700),
    cleaningPerVisit: pesos(270),
    garbageWeekly: pesos(150),
  };

  it('prefills the rate of each recurring category', () => {
    const suggestions = Object.fromEntries(
      MOVEMENT_CATEGORIES.map((category) => [
        category,
        suggestedAmount(category, rates)?.toString() ?? null,
      ]),
    );
    expect(suggestions).toEqual({
      UNIT_PAYMENT: '700.00',
      OTHER_INCOME: null,
      GARBAGE: '150.00',
      CLEANING: '270.00',
      OTHER_EXPENSE: null,
    });
  });
});

describe('garbage weeks', () => {
  it('lists the weeks whose Sunday falls in the month', () => {
    // October 2026 starts on a Thursday; its Sundays are the 4th, 11th, 18th and 25th.
    expect(garbageWeeksOf(october).map(String)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
    // November 2026 starts on a Sunday, so the week of 26 October is November's.
    expect(garbageWeeksOf(YearMonth.of(2026, 11)).map(String)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ]);
  });

  it('marks each week paid, pending once it has begun, or upcoming', () => {
    const paidLate = CashMovement.record('g1', garbage('2026-10-06', '2026-09-28'));
    const removed = CashMovement.record('g2', garbage('2026-10-11', '2026-10-05'));
    removed.remove();

    const weeks = garbageSchedule(october, d('2026-10-14'), [paidLate, removed]);
    expect(weeks.map((w) => [String(w.week), w.status, w.paidBy?.id ?? null])).toEqual([
      ['2026-09-28', 'PAID', 'g1'],
      ['2026-10-05', 'PENDING', null],
      ['2026-10-12', 'PENDING', null],
      ['2026-10-19', 'UPCOMING', null],
    ]);
  });

  it('suggests paying on Sunday, or today if Sunday has not come yet', () => {
    const weeks = garbageSchedule(october, d('2026-10-14'), []);
    expect(weeks.map((w) => [String(w.payday), String(w.suggestedDate)])).toEqual([
      ['2026-10-04', '2026-10-04'],
      ['2026-10-11', '2026-10-11'],
      ['2026-10-18', '2026-10-14'],
      ['2026-10-25', '2026-10-14'],
    ]);
  });

  it('counts a week as paid by a row dated in another month', () => {
    // The week of 26 October is November's, paid on Saturday 31 October.
    const early = CashMovement.record('g1', garbage('2026-10-31', '2026-10-26'));
    const [first] = garbageSchedule(YearMonth.of(2026, 11), d('2026-11-03'), [early]);
    expect(first?.status).toBe('PAID');
  });

  it('pays each week only once', () => {
    const paid = CashMovement.record('g1', garbage('2026-10-04', '2026-09-28'));
    const again = CashMovement.record('g2', garbage('2026-10-05', '2026-09-28'));
    expect(() => assertWeekUnpaid(again, [paid])).toThrow(withCode('GARBAGE_WEEK_PAID'));
    // A row is not its own duplicate, and a removed row frees its week.
    expect(() => assertWeekUnpaid(paid, [paid])).not.toThrow();
    paid.remove();
    expect(() => assertWeekUnpaid(again, [paid])).not.toThrow();
    // Rows that pay for no week are never in the way.
    const cleaning = CashMovement.record('c1', expense('2026-10-04', 'CLEANING', 270));
    expect(() => assertWeekUnpaid(cleaning, [paid])).not.toThrow();
  });
});

describe('cleaning payouts', () => {
  it('groups visits by Monday-to-Sunday week and ignores other rows', () => {
    const rows = [
      CashMovement.record('c1', expense('2026-09-28', 'CLEANING', 270)), // Monday
      CashMovement.record('c2', expense('2026-09-30', 'CLEANING', 270)),
      CashMovement.record('c3', expense('2026-10-02', 'CLEANING', 270)), // same week, next month
      CashMovement.record('c4', expense('2026-10-05', 'CLEANING', 300)), // next Monday
      CashMovement.record('g1', expense('2026-09-29', 'GARBAGE', 150)),
      CashMovement.record('p1', payment('2026-09-29', 501)),
    ];
    const removed = CashMovement.record('c5', expense('2026-10-06', 'CLEANING', 270));
    removed.remove();

    const payouts = weeklyCleaningPayouts([...rows, removed].reverse());
    expect(
      payouts.map((p) => [String(p.weekStart), p.dates.map(String), p.total.toString()]),
    ).toEqual([
      ['2026-09-28', ['2026-09-28', '2026-09-30', '2026-10-02'], '810.00'],
      ['2026-10-05', ['2026-10-05'], '300.00'],
    ]);
  });

  it('pays a week that crosses months in full, in both months', () => {
    const rows = [
      CashMovement.record('c0', expense('2026-09-21', 'CLEANING', 270)),
      CashMovement.record('c1', expense('2026-09-30', 'CLEANING', 270)),
      CashMovement.record('c2', expense('2026-10-02', 'CLEANING', 270)),
      CashMovement.record('c3', expense('2026-10-31', 'CLEANING', 270)),
      CashMovement.record('c4', expense('2026-11-01', 'CLEANING', 270)),
      CashMovement.record('c5', expense('2026-11-02', 'CLEANING', 270)),
    ];
    const weeks = (month: YearMonth) =>
      cleaningPayoutsOf(month, rows).map((p) => [String(p.weekStart), p.dates.length]);

    expect(weeks(YearMonth.of(2026, 9))).toEqual([
      ['2026-09-21', 1],
      ['2026-09-28', 2],
    ]);
    expect(weeks(october)).toEqual([
      ['2026-09-28', 2],
      ['2026-10-26', 2],
    ]);
  });

  it('records each visit date once', () => {
    const existing = [CashMovement.record('c1', expense('2026-10-05', 'CLEANING', 270))];
    expect(() => assertNewVisits([d('2026-10-06'), d('2026-10-07')], existing)).not.toThrow();
    expect(() => assertNewVisits([d('2026-10-05')], existing)).toThrow(
      withCode('CLEANING_VISIT_RECORDED'),
    );
    expect(() => assertNewVisits([d('2026-10-06'), d('2026-10-06')], [])).toThrow(
      withCode('CLEANING_VISIT_RECORDED'),
    );
    const garbageThatDay = CashMovement.record('g1', expense('2026-10-05', 'GARBAGE', 150));
    expect(() => assertNewVisits([d('2026-10-05')], [garbageThatDay])).not.toThrow();
  });
});
