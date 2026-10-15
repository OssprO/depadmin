import {
  ConflictError,
  LocalDate,
  Money,
  type MovementCategory,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import type { CashMovement } from './cash-movement.js';

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

// Garbage: one fixed payment per calendar week (spec 4.3). Weeks run Monday to Sunday and the
// suggested payday is the Saturday (PLAN question 4); the user adjusts the real date.

/** ISO day of the week the garbage is paid: Saturday. */
export const GARBAGE_PAYDAY = 6;

export type GarbageWeekStatus = 'PAID' | 'PENDING' | 'UPCOMING';

/**
 * A week of garbage as the month's list shows it. A pending week is a suggestion, not a row:
 * it counts nowhere until it is confirmed, which records a real row.
 */
export interface GarbageWeek {
  /** Monday. */
  readonly week: LocalDate;
  /** Saturday, the suggested payday; it decides which month lists the week. */
  readonly payday: LocalDate;
  /** Paid by a live row (in any month); pending once the week has begun; upcoming before. */
  readonly status: GarbageWeekStatus;
  readonly paidBy: CashMovement | null;
  /** The date a one-tap confirmation records: the payday, or today if that comes first. */
  readonly suggestedDate: LocalDate;
}

/** Mondays of the weeks whose payday (Saturday) falls in the month: four or five of them. */
export function garbageWeeksOf(month: YearMonth): LocalDate[] {
  const first = LocalDate.firstOf(month);
  const last = LocalDate.lastOf(month);
  const weeks: LocalDate[] = [];
  let payday = first.plusDays((GARBAGE_PAYDAY - first.dayOfWeek + 7) % 7);
  for (; !payday.isAfter(last); payday = payday.plusDays(7)) weeks.push(payday.startOfWeek());
  return weeks;
}

/**
 * Drops the weeks that begin before the books do. The first month can list a week that
 * started in the month before (August 2026 lists the week of 27 July, since its Saturday is
 * 1 August); that week was paid, or not, on paper, so the books do not suggest it.
 */
export function weeksWithinBooks(
  weeks: readonly GarbageWeek[],
  booksStart: YearMonth,
): GarbageWeek[] {
  const firstDay = LocalDate.firstOf(booksStart);
  return weeks.filter((week) => !week.week.isBefore(firstDay));
}

/**
 * The month's garbage weeks and how each stands, given the live garbage rows that pay for
 * them (wherever those rows are dated).
 */
export function garbageSchedule(
  month: YearMonth,
  today: LocalDate,
  garbageRows: readonly CashMovement[],
): GarbageWeek[] {
  return garbageWeeksOf(month).map((week) => {
    const payday = week.plusDays(GARBAGE_PAYDAY - 1);
    const paidBy =
      garbageRows.find((row) => !row.isRemoved && row.details.week?.equals(week)) ?? null;
    const status: GarbageWeekStatus = paidBy
      ? 'PAID'
      : week.isAfter(today)
        ? 'UPCOMING'
        : 'PENDING';
    return {
      week,
      payday,
      status,
      paidBy,
      suggestedDate: today.isBefore(payday) ? today : payday,
    };
  });
}

/** Each week is paid once: a garbage row cannot pay for a week another live row pays for. */
export function assertWeekUnpaid(
  movement: CashMovement,
  garbageRows: readonly CashMovement[],
): void {
  const { week } = movement.details;
  if (!week || movement.isRemoved) return;
  const other = garbageRows.find(
    (row) => row.id !== movement.id && !row.isRemoved && row.details.week?.equals(week),
  );
  if (other) {
    throw new ConflictError(
      'GARBAGE_WEEK_PAID',
      `The week of ${week} is already paid by movement ${other.id} (${other.date})`,
    );
  }
}

// Cleaning: one row per visit at the visit's date, paid weekly (spec 4.3).

export interface WeeklyCleaningPayout {
  /** Monday of the week. */
  readonly weekStart: LocalDate;
  /** The visits of the week, by date. */
  readonly dates: readonly LocalDate[];
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
      dates: visits.map((visit) => visit.date).sort((a, b) => a.compareTo(b)),
      total: Money.sum(visits.map((visit) => visit.amount)),
    }));
}

/**
 * The payouts of the weeks that touch a month. A week that crosses into the next or the
 * previous month includes its visits there too, since the person is paid for the whole
 * week; pass the rows dated in that whole span (see `cleaningSpanOf`).
 */
export function cleaningPayoutsOf(
  month: YearMonth,
  movements: readonly CashMovement[],
): WeeklyCleaningPayout[] {
  const { first, last } = cleaningSpanOf(month);
  return weeklyCleaningPayouts(
    movements.filter((row) => !row.date.isBefore(first) && !row.date.isAfter(last)),
  );
}

/** From the Monday of the month's first week to the Sunday of its last one. */
export function cleaningSpanOf(month: YearMonth): { first: LocalDate; last: LocalDate } {
  const last = LocalDate.lastOf(month);
  return {
    first: LocalDate.firstOf(month).startOfWeek(),
    last: last.startOfWeek().plusDays(6),
  };
}

/** The shortcut that marks several visits at once records each date only once. */
export function assertNewVisits(
  dates: readonly LocalDate[],
  existing: readonly CashMovement[],
): void {
  const seen = new Set<string>();
  for (const date of dates) {
    const key = String(date);
    const recorded = existing.some(
      (row) => row.category === 'CLEANING' && !row.isRemoved && row.date.equals(date),
    );
    if (seen.has(key) || recorded) {
      throw new ConflictError('CLEANING_VISIT_RECORDED', `There is already a visit on ${key}`);
    }
    seen.add(key);
  }
}
