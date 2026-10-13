import { daysInMonth } from './calendar.js';
import { ValidationError } from './domain-error.js';
import type { LocalDate } from './local-date.js';

const PATTERN = /^(\d{4})-(\d{2})$/;

/**
 * A calendar month (e.g. 2026-08): the unit of reports, charges and shifts.
 * Internally an index of months since year 0, which makes arithmetic trivial.
 */
export class YearMonth {
  private constructor(private readonly index: number) {}

  static of(year: number, month: number): YearMonth {
    if (!Number.isInteger(year) || year < 1 || year > 9999) {
      throw new ValidationError('YEAR_MONTH_INVALID', `Invalid year ${year}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError('YEAR_MONTH_INVALID', `Invalid month ${month}`);
    }
    return new YearMonth(year * 12 + (month - 1));
  }

  /** Parses `YYYY-MM`. */
  static parse(text: string): YearMonth {
    const match = PATTERN.exec(text);
    if (!match) throw new ValidationError('YEAR_MONTH_INVALID', `Expected YYYY-MM, got "${text}"`);
    return YearMonth.of(Number(match[1]), Number(match[2]));
  }

  static min(a: YearMonth, b: YearMonth): YearMonth {
    return a.index <= b.index ? a : b;
  }

  static max(a: YearMonth, b: YearMonth): YearMonth {
    return a.index >= b.index ? a : b;
  }

  get year(): number {
    return Math.floor(this.index / 12);
  }

  get month(): number {
    return (this.index % 12) + 1;
  }

  get daysInMonth(): number {
    return daysInMonth(this.year, this.month);
  }

  plus(months: number): YearMonth {
    if (!Number.isInteger(months)) {
      throw new ValidationError('YEAR_MONTH_INVALID', `Cannot add ${months} months`);
    }
    return new YearMonth(this.index + months);
  }

  next(): YearMonth {
    return this.plus(1);
  }

  previous(): YearMonth {
    return this.plus(-1);
  }

  /** Months from this one to `other`; negative when `other` is earlier. */
  monthsUntil(other: YearMonth): number {
    return other.index - this.index;
  }

  /** Every month from this one to `last`, both included. */
  through(last: YearMonth): YearMonth[] {
    const months: YearMonth[] = [];
    for (let i = this.index; i <= last.index; i++) months.push(new YearMonth(i));
    return months;
  }

  contains(date: LocalDate): boolean {
    return date.year === this.year && date.month === this.month;
  }

  equals(other: YearMonth): boolean {
    return this.index === other.index;
  }

  compareTo(other: YearMonth): number {
    return Math.sign(this.index - other.index);
  }

  isBefore(other: YearMonth): boolean {
    return this.index < other.index;
  }

  isAfter(other: YearMonth): boolean {
    return this.index > other.index;
  }

  toString(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
