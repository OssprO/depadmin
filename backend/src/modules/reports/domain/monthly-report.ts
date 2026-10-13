import {
  ConflictError,
  type Money,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';

export type ReportStatus = 'OPEN' | 'CLOSED';

export interface MonthTotals {
  readonly income: Money;
  readonly expense: Money;
}

/** The figures frozen when a month is closed; the PDF of a closed month is built from them. */
export interface ReportSnapshot extends MonthTotals {
  readonly openingBalance: Money;
  readonly closingBalance: Money;
}

/**
 * A month's report. While open, its figures are computed live from the cashbook; closing it
 * stores a snapshot and freezes the cashbook; reopening drops the snapshot.
 */
export class MonthlyReport {
  private constructor(
    readonly month: YearMonth,
    private frozen: ReportSnapshot | null,
  ) {}

  static open(month: YearMonth): MonthlyReport {
    return new MonthlyReport(month, null);
  }

  static restore(month: YearMonth, snapshot: ReportSnapshot | null): MonthlyReport {
    if (
      snapshot &&
      !snapshotOf(snapshot.openingBalance, snapshot).closingBalance.equals(snapshot.closingBalance)
    ) {
      throw new ValidationError('REPORT_SNAPSHOT_INVALID', `Snapshot of ${month} does not add up`);
    }
    return new MonthlyReport(month, snapshot);
  }

  get status(): ReportStatus {
    return this.frozen ? 'CLOSED' : 'OPEN';
  }

  get isOpen(): boolean {
    return this.frozen === null;
  }

  get snapshot(): ReportSnapshot | null {
    return this.frozen;
  }

  close(openingBalance: Money, totals: MonthTotals): ReportSnapshot {
    if (this.frozen)
      throw new ConflictError('MONTH_ALREADY_CLOSED', `${this.month} is already closed`);
    this.frozen = snapshotOf(openingBalance, totals);
    return this.frozen;
  }

  reopen(): void {
    if (!this.frozen) throw new ConflictError('MONTH_NOT_CLOSED', `${this.month} is not closed`);
    this.frozen = null;
  }

  /**
   * Carries a new opening balance into a closed month after an earlier month changed. Its
   * rows are frozen, so income and expense stay; only the balances move.
   */
  restate(openingBalance: Money): ReportSnapshot {
    if (!this.frozen) throw new ConflictError('MONTH_NOT_CLOSED', `${this.month} is not closed`);
    this.frozen = snapshotOf(openingBalance, this.frozen);
    return this.frozen;
  }
}

function snapshotOf(openingBalance: Money, totals: MonthTotals): ReportSnapshot {
  return {
    openingBalance,
    income: totals.income,
    expense: totals.expense,
    closingBalance: closingBalanceOf(openingBalance, totals),
  };
}

export function closingBalanceOf(openingBalance: Money, { income, expense }: MonthTotals): Money {
  return openingBalance.plus(income).minus(expense);
}
