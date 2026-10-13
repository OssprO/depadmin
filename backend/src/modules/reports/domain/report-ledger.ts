import {
  ConflictError,
  type Money,
  NotFoundError,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { closingBalanceOf, MonthlyReport, type MonthTotals } from './monthly-report.js';

/** Where the books start: the cut-over month and the cash on hand at its beginning. */
export interface ReportingStart {
  readonly month: YearMonth;
  readonly openingBalance: Money;
}

/** Live totals of a month's cashbook, supplied by the application layer. */
export type LiveTotals = (month: YearMonth) => MonthTotals;

export interface MonthBalances {
  readonly openingBalance: Money;
  readonly closingBalance: Money;
}

/**
 * The chain of monthly reports from the reporting start. Each month opens with the previous
 * month's closing balance. Months are opened in order, closed in order, and reopening a month
 * restates every later closed month once it is closed again (cascade).
 */
export class ReportLedger {
  private constructor(
    readonly start: ReportingStart,
    private readonly chain: MonthlyReport[],
  ) {}

  static restore(start: ReportingStart, reports: readonly MonthlyReport[]): ReportLedger {
    const chain = [...reports].sort((a, b) => a.month.compareTo(b.month));
    chain.forEach((report, i) => {
      if (!report.month.equals(start.month.plus(i))) {
        throw new ValidationError(
          'REPORT_CHAIN_INVALID',
          `Reports must be consecutive from ${start.month}; found ${report.month} at position ${i}`,
        );
      }
    });
    return new ReportLedger(start, chain);
  }

  get reports(): readonly MonthlyReport[] {
    return this.chain;
  }

  /** The next month to open: the reporting start, or the month after the last report. */
  get nextMonth(): YearMonth {
    const last = this.chain.at(-1);
    return last ? last.month.next() : this.start.month;
  }

  openMonth(month: YearMonth): MonthlyReport {
    if (!month.equals(this.nextMonth)) {
      throw new ConflictError(
        'MONTH_OUT_OF_ORDER',
        `The next month to open is ${this.nextMonth}, not ${month}`,
      );
    }
    const report = MonthlyReport.open(month);
    this.chain.push(report);
    return report;
  }

  report(month: YearMonth): MonthlyReport {
    return this.chain[this.indexOf(month)] as MonthlyReport;
  }

  /**
   * Balances of any opened month. A closed month answers with its snapshot, as frozen; an
   * open month opens with the previous month's closing balance (itself live if still open).
   */
  balancesOf(month: YearMonth, live: LiveTotals): MonthBalances {
    const index = this.indexOf(month);
    const report = this.chain[index] as MonthlyReport;
    if (report.snapshot) return report.snapshot;

    let openingBalance = this.start.openingBalance;
    for (const earlier of this.chain.slice(0, index)) {
      openingBalance =
        earlier.snapshot?.closingBalance ?? closingBalanceOf(openingBalance, live(earlier.month));
    }
    return { openingBalance, closingBalance: closingBalanceOf(openingBalance, live(month)) };
  }

  /**
   * Closes a month with its live totals, then restates the later closed months that follow
   * it without a gap. Returns every report that changed, for persistence.
   */
  closeMonth(month: YearMonth, live: LiveTotals): MonthlyReport[] {
    const index = this.indexOf(month);
    const previous = this.chain[index - 1];
    if (previous?.isOpen) {
      throw new ConflictError('PREVIOUS_MONTH_OPEN', `Close ${previous.month} before ${month}`);
    }
    const report = this.chain[index] as MonthlyReport;
    const openingBalance = previous?.snapshot?.closingBalance ?? this.start.openingBalance;
    let carried = report.close(openingBalance, live(month)).closingBalance;

    const changed = [report];
    for (const later of this.chain.slice(index + 1)) {
      if (later.isOpen) break; // its balances are live; it cascades when it closes
      carried = later.restate(carried).closingBalance;
      changed.push(later);
    }
    return changed;
  }

  reopenMonth(month: YearMonth): MonthlyReport {
    const report = this.report(month);
    report.reopen();
    return report;
  }

  private indexOf(month: YearMonth): number {
    const index = this.chain.findIndex((r) => r.month.equals(month));
    if (index < 0) throw new NotFoundError('REPORT_NOT_FOUND', `${month} has not been opened`);
    return index;
  }
}
