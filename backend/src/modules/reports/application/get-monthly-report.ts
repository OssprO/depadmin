import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  CLOCK,
  type Clock,
  DomainError,
  type Money,
  type MonthStatus,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import type { AccountStatement, PaymentCoverage } from '../../billing/application/index.js';
import {
  type CashbookTotals,
  type CashMovement,
  type GarbageWeek,
  ReadCashbook,
  type WeeklyCleaningPayout,
} from '../../cashbook/application/index.js';
import { GetRates } from '../../settings/application/index.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/index.js';
import { GetAccounts } from './accounts.js';
import { mayClose } from './close-month.js';
import { liveTotalsOf } from './live-totals.js';
import { openingBlocker } from './open-month.js';
import { mayReopen } from './reopen-month.js';

export interface ReportRow {
  readonly movement: CashMovement;
  /** For a depto payment: what it covered ("cubre sep y oct", "abono parcial a ago"). */
  readonly coverage: readonly PaymentCoverage[];
}

/** The month as its report will read: the turn admin's main screen. */
export interface MonthlyReportView {
  readonly month: YearMonth;
  readonly status: MonthStatus;
  /** False until the superadmin sets where the books start. */
  readonly reportingStarted: boolean;
  /** Null until the month is opened. */
  readonly balances: { readonly opening: Money; readonly closing: Money } | null;
  readonly totals: CashbookTotals;
  readonly rows: readonly ReportRow[];
  /** What the caller can do now. */
  readonly canWrite: boolean;
  readonly canOpen: boolean;
  /** Over, open, the month before it closed, and the caller may close it. */
  readonly canClose: boolean;
  /** Closed, and the caller is the superadmin. */
  readonly canReopen: boolean;
  /** Amounts to prefill per category (null before any rate is in force). */
  readonly suggestions: {
    readonly maintenanceFee: Money;
    readonly cleaningPerVisit: Money;
    readonly garbageWeekly: Money;
  } | null;
  /** Every depto's account, to list the ones that owe first when recording a payment. */
  readonly accounts: readonly AccountStatement[];
  /** The month's garbage weeks; the pending ones are suggestions outside the totals. */
  readonly garbageWeeks: readonly GarbageWeek[];
  /** What to pay the cleaning person for each week that touches the month. */
  readonly cleaningPayouts: readonly WeeklyCleaningPayout[];
}

/**
 * The live draft of a month's report: opening balance, its rows (with what each payment
 * covered), totals and closing balance. A closed month answers with its frozen snapshot.
 */
@Injectable()
export class GetMonthlyReport {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly cashbook: ReadCashbook,
    private readonly accounts: GetAccounts,
    private readonly calendars: LoadShiftCalendar,
    private readonly rates: GetRates,
  ) {}

  async execute(actor: Actor, month: YearMonth): Promise<MonthlyReportView> {
    const today = this.clock.today();
    const [ledger, cashbook, accounts, calendar, suggestions, garbageWeeks, cleaningPayouts] =
      await Promise.all([
        this.reports.loadLedger(),
        this.cashbook.month(month),
        this.accounts.all(),
        this.calendars.execute(month),
        this.suggestionsFor(month),
        this.cashbook.garbageWeeks(month, today),
        this.cashbook.cleaningPayouts(month),
      ]);
    const report = ledger?.reports.find((r) => r.month.equals(month));
    const status: MonthStatus = !report ? 'NOT_OPENED' : report.isOpen ? 'OPEN' : 'CLOSED';

    let balances: MonthlyReportView['balances'] = null;
    if (ledger && report) {
      const live = await liveTotalsOf(this.cashbook, ledger, month);
      const { openingBalance, closingBalance } = ledger.balancesOf(month, live);
      balances = { opening: openingBalance, closing: closingBalance };
    }
    const access = { actor, month, today, responsibility: calendar };

    const coverage = (movement: CashMovement) => {
      const unit = movement.details.unit;
      const statement = unit && accounts.find((account) => account.unit === unit);
      return statement ? statement.coverageOf(movement.id) : [];
    };

    return {
      month,
      status,
      reportingStarted: ledger !== null,
      balances,
      totals: cashbook.totals(),
      rows: cashbook.movements.map((movement) => ({ movement, coverage: coverage(movement) })),
      canWrite: status === 'OPEN' && this.policy.decide(access).allowed,
      canOpen:
        status === 'NOT_OPENED' &&
        ledger !== null &&
        openingBlocker(ledger, month, today.yearMonth) === null &&
        this.policy.decide(access).allowed,
      canClose: ledger !== null && mayClose(ledger, access),
      canReopen: mayReopen(actor, status),
      suggestions,
      accounts,
      garbageWeeks,
      cleaningPayouts,
    };
  }

  private async suggestionsFor(month: YearMonth): Promise<MonthlyReportView['suggestions']> {
    try {
      const { maintenanceFee, cleaningPerVisit, garbageWeekly } = await this.rates.forMonth(month);
      return { maintenanceFee, cleaningPerVisit, garbageWeekly };
    } catch (error) {
      // No rates configured, or none in force yet: the form just starts empty.
      if (error instanceof DomainError) return null;
      throw error;
    }
  }
}
