import { ValidationError } from './domain-error.js';
import type { YearMonth } from './year-month.js';

/**
 * Consecutive months from `from` to `to`, both included. `to = null` means "until further
 * notice", e.g. a depto that is inactive with no known end date.
 */
export class YearMonthRange {
  private constructor(
    readonly from: YearMonth,
    readonly to: YearMonth | null,
  ) {}

  static between(from: YearMonth, to: YearMonth): YearMonthRange {
    if (to.isBefore(from)) {
      throw new ValidationError('RANGE_INVALID', `Range ends (${to}) before it starts (${from})`);
    }
    return new YearMonthRange(from, to);
  }

  static startingAt(from: YearMonth): YearMonthRange {
    return new YearMonthRange(from, null);
  }

  static single(month: YearMonth): YearMonthRange {
    return new YearMonthRange(month, month);
  }

  get isOpenEnded(): boolean {
    return this.to === null;
  }

  contains(month: YearMonth): boolean {
    return !month.isBefore(this.from) && (this.to === null || !month.isAfter(this.to));
  }

  /** Whether every month of `other` is inside this range. */
  encloses(other: YearMonthRange): boolean {
    if (other.from.isBefore(this.from)) return false;
    if (this.to === null) return true;
    return other.to !== null && !other.to.isAfter(this.to);
  }

  overlaps(other: YearMonthRange): boolean {
    const startsBeforeOtherEnds = other.to === null || !this.from.isAfter(other.to);
    const otherStartsBeforeThisEnds = this.to === null || !other.from.isAfter(this.to);
    return startsBeforeOtherEnds && otherStartsBeforeThisEnds;
  }

  /** Same start, with a definite end. */
  endingAt(to: YearMonth): YearMonthRange {
    return YearMonthRange.between(this.from, to);
  }

  equals(other: YearMonthRange): boolean {
    const sameEnd =
      this.to === null || other.to === null ? this.to === other.to : this.to.equals(other.to);
    return this.from.equals(other.from) && sameEnd;
  }

  toString(): string {
    return `${this.from}..${this.to ?? ''}`;
  }
}
