import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  CLOCK,
  type Clock,
  type Money,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { ReadCashbook } from '../../cashbook/application/index.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import { REPORT_REPOSITORY, type ReportRepository, type ReportStatus } from '../domain/index.js';
import { mayClose } from './close-month.js';
import { liveTotalsOf } from './live-totals.js';
import { mayReopen } from './reopen-month.js';

/** One opened month in the history: its report in four figures and what can be done. */
export interface MonthHistoryEntry {
  readonly month: YearMonth;
  readonly status: ReportStatus;
  readonly openingBalance: Money;
  readonly income: Money;
  readonly expense: Money;
  readonly closingBalance: Money;
  /** Of the building's history, before the cut-over. */
  readonly historical: boolean;
  readonly canClose: boolean;
  readonly canReopen: boolean;
}

export interface MonthHistory {
  /** False until the superadmin sets where the books start. */
  readonly reportingStarted: boolean;
  /** Every opened month, newest first. */
  readonly months: readonly MonthHistoryEntry[];
}

/**
 * Every month since the books started. A closed month reads from its snapshot, as frozen;
 * an open one is live. The last month's closing balance is the cash on hand now.
 */
@Injectable()
export class GetMonthHistory {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly cashbook: ReadCashbook,
    private readonly calendars: LoadShiftCalendar,
  ) {}

  async execute(actor: Actor): Promise<MonthHistory> {
    const ledger = await this.reports.loadLedger();
    const last = ledger?.reports.at(-1);
    if (!ledger || !last) return { reportingStarted: ledger !== null, months: [] };

    const today = this.clock.today();
    const [live, calendar] = await Promise.all([
      liveTotalsOf(this.cashbook, ledger),
      this.calendars.execute(ledger.start.month, last.month),
    ]);
    const months = ledger.reports.map(({ month, status, snapshot }): MonthHistoryEntry => {
      const { income, expense } = snapshot ?? live(month);
      const { openingBalance, closingBalance } = ledger.balancesOf(month, live);
      return {
        month,
        status,
        openingBalance,
        income,
        expense,
        closingBalance,
        historical: ledger.isHistory(month),
        canClose: mayClose(ledger, { actor, month, today, responsibility: calendar }),
        canReopen: mayReopen(actor, status),
      };
    });
    return { reportingStarted: true, months: months.reverse() };
  }
}
