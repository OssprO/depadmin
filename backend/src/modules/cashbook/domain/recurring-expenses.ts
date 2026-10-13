import { type LocalDate, Money } from '../../../shared-kernel/index.js';
import type { CashMovement } from './cash-movement.js';
import type { MovementCategory } from './movement-category.js';

/** The rates the cashbook needs to prefill amounts (resolved for the row's date). */
export interface SuggestionRates {
  readonly maintenanceFee: Money;
  readonly cleaningPerVisit: Money;
  readonly garbageWeekly: Money;
}

/** Amount to prefill when adding a row; `null` for free-form categories. */
export function suggestedAmount(category: MovementCategory, rates: SuggestionRates): Money | null {
  switch (category) {
    case 'UNIT_PAYMENT':
      return rates.maintenanceFee;
    case 'CLEANING':
      return rates.cleaningPerVisit;
    case 'GARBAGE':
      return rates.garbageWeekly;
    case 'OTHER_INCOME':
    case 'OTHER_EXPENSE':
      return null;
  }
}

export interface WeeklyCleaningPayout {
  /** Monday of the week. */
  readonly weekStart: LocalDate;
  readonly visits: number;
  readonly total: Money;
}

/**
 * How much to pay the cleaning person each week (Monday to Sunday). This is only a payout
 * summary; every visit is still its own row in the month of its date.
 */
export function weeklyCleaningPayouts(movements: readonly CashMovement[]): WeeklyCleaningPayout[] {
  const weeks = new Map<string, { weekStart: LocalDate; visits: CashMovement[] }>();
  for (const movement of movements) {
    if (movement.category !== 'CLEANING' || movement.isRemoved) continue;
    const weekStart = movement.date.startOfWeek();
    const key = weekStart.toString();
    const week = weeks.get(key) ?? { weekStart, visits: [] };
    week.visits.push(movement);
    weeks.set(key, week);
  }
  return [...weeks.values()]
    .sort((a, b) => a.weekStart.compareTo(b.weekStart))
    .map(({ weekStart, visits }) => ({
      weekStart,
      visits: visits.length,
      total: Money.sum(visits.map((visit) => visit.amount)),
    }));
}
