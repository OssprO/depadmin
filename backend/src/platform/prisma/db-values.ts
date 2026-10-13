import { LocalDate, Money, YearMonth } from '../../shared-kernel/index.js';

// Conversions between domain value objects and Prisma column values. Prisma reads DATE
// columns as JS Dates at UTC midnight, so only the UTC calendar fields are meaningful.

export function toDbDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

export function fromDbDate(value: Date): LocalDate {
  return LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

/** Months are stored as the first day of the month. */
export function toDbMonth(month: YearMonth): Date {
  return toDbDate(LocalDate.firstOf(month));
}

export function fromDbMonth(value: Date): YearMonth {
  return fromDbDate(value).yearMonth;
}

export function fromDbMoney(centavos: number): Money {
  return Money.ofCentavos(centavos);
}
