import { describe, expect, it } from 'vitest';
import { CashMovement } from './cash-movement.js';
import { MOVEMENT_CATEGORIES } from './movement-category.js';
import { suggestedAmount, weeklyCleaningPayouts } from './recurring-expenses.js';
import { expense, payment, pesos } from './testing.js';

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

describe('weeklyCleaningPayouts', () => {
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
    expect(payouts.map((p) => [String(p.weekStart), p.visits, p.total.toString()])).toEqual([
      ['2026-09-28', 3, '810.00'],
      ['2026-10-05', 1, '300.00'],
    ]);
  });
});
