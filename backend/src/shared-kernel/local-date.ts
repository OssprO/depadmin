import { civilFromEpochDay, daysInMonth, epochDayOf } from './calendar.js';
import { ValidationError } from './domain-error.js';
import { YearMonth } from './year-month.js';

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * A calendar date with no time or time zone (the building's local date). Movements, write
 * windows and weeks are all reasoned about in local dates; turning "now" into one is the
 * `Clock` adapter's job.
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
    private readonly epochDay: number,
  ) {}

  static of(year: number, month: number, day: number): LocalDate {
    YearMonth.of(year, month); // validates year and month
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
      throw new ValidationError('DATE_INVALID', `Invalid day ${year}-${month}-${day}`);
    }
    return new LocalDate(year, month, day, epochDayOf(year, month, day));
  }

  /** Parses `YYYY-MM-DD`. */
  static parse(text: string): LocalDate {
    const match = PATTERN.exec(text);
    if (!match) throw new ValidationError('DATE_INVALID', `Expected YYYY-MM-DD, got "${text}"`);
    return LocalDate.of(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  static ofEpochDay(epochDay: number): LocalDate {
    const { year, month, day } = civilFromEpochDay(epochDay);
    return new LocalDate(year, month, day, epochDay);
  }

  static firstOf(month: YearMonth): LocalDate {
    return LocalDate.of(month.year, month.month, 1);
  }

  static lastOf(month: YearMonth): LocalDate {
    return LocalDate.of(month.year, month.month, month.daysInMonth);
  }

  get yearMonth(): YearMonth {
    return YearMonth.of(this.year, this.month);
  }

  get dayOfWeek(): DayOfWeek {
    // 1970-01-01 was a Thursday.
    return (((((this.epochDay + 3) % 7) + 7) % 7) + 1) as DayOfWeek;
  }

  plusDays(days: number): LocalDate {
    if (!Number.isInteger(days)) {
      throw new ValidationError('DATE_INVALID', `Cannot add ${days} days`);
    }
    return LocalDate.ofEpochDay(this.epochDay + days);
  }

  /** The Monday of this date's week (weeks run Monday to Sunday). */
  startOfWeek(): LocalDate {
    return this.plusDays(1 - this.dayOfWeek);
  }

  daysUntil(other: LocalDate): number {
    return other.epochDay - this.epochDay;
  }

  equals(other: LocalDate): boolean {
    return this.epochDay === other.epochDay;
  }

  compareTo(other: LocalDate): number {
    return Math.sign(this.epochDay - other.epochDay);
  }

  isBefore(other: LocalDate): boolean {
    return this.epochDay < other.epochDay;
  }

  isAfter(other: LocalDate): boolean {
    return this.epochDay > other.epochDay;
  }

  toString(): string {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    return `${pad(this.year, 4)}-${pad(this.month)}-${pad(this.day)}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
