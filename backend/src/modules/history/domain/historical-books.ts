import {
  ConflictError,
  type Instant,
  type Money,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';

export type HistoryStatus = 'IN_REVIEW' | 'VERIFIED';

/**
 * The building's books from before the platform, transcribed from the paper sheets: the
 * months they span and the cash on hand when the first one began. They live apart from the
 * live books (ADR-0022). The superadmin reviews them, which is the only time they change and
 * goes unaudited, and then verifies them, which freezes them.
 */
export class HistoricalBooks {
  private constructor(
    readonly firstMonth: YearMonth,
    readonly lastMonth: YearMonth,
    readonly openingBalance: Money,
    private verified: Instant | null,
  ) {}

  static start(firstMonth: YearMonth, lastMonth: YearMonth, openingBalance: Money) {
    return HistoricalBooks.restore(firstMonth, lastMonth, openingBalance, null);
  }

  static restore(
    firstMonth: YearMonth,
    lastMonth: YearMonth,
    openingBalance: Money,
    verifiedAt: Instant | null,
  ): HistoricalBooks {
    if (lastMonth.isBefore(firstMonth)) {
      throw new ValidationError(
        'HISTORY_SPAN_INVALID',
        `The history cannot end (${lastMonth}) before it begins (${firstMonth})`,
      );
    }
    return new HistoricalBooks(firstMonth, lastMonth, openingBalance, verifiedAt);
  }

  get verifiedAt(): Instant | null {
    return this.verified;
  }

  get status(): HistoryStatus {
    return this.verified ? 'VERIFIED' : 'IN_REVIEW';
  }

  /** Every month of the span, oldest first, including those with no sheet yet. */
  get months(): YearMonth[] {
    return this.firstMonth.through(this.lastMonth);
  }

  covers(month: YearMonth): boolean {
    return !month.isBefore(this.firstMonth) && !month.isAfter(this.lastMonth);
  }

  /** Rows and sheets belong to one of the history's months. */
  assertCovers(month: YearMonth): void {
    if (!this.covers(month)) {
      throw new ValidationError(
        'HISTORY_MONTH_OUTSIDE',
        `${month} is outside the history (${this.firstMonth} to ${this.lastMonth})`,
      );
    }
  }

  assertInReview(): void {
    if (this.verified) {
      throw new ConflictError('HISTORY_VERIFIED', 'The history was verified and is frozen');
    }
  }

  /** The live books start after the history; the cut-over month is never in both. */
  assertEndsBefore(month: YearMonth): void {
    if (!this.lastMonth.isBefore(month)) {
      throw new ConflictError(
        'HISTORY_OVERLAPS_BOOKS',
        `The history ends in ${this.lastMonth}; the live books cannot start in ${month}`,
      );
    }
  }
}
