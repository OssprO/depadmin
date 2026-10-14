import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  type Instant,
  type LocalDate,
  Money,
  UnitNumber,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import type { ChargeType, PaymentCoverage } from '../../billing/application/index.js';
import {
  type CashbookTotals,
  type CashMovement,
  ReadCashbook,
  type WeeklyCleaningPayout,
  weeklyCleaningPayouts,
} from '../../cashbook/application/index.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import { REPORT_REPOSITORY, type ReportRepository, type ReportStatus } from '../domain/index.js';
import { GetAccounts } from './accounts.js';
import { liveTotalsOf } from './live-totals.js';
import { requireLedger } from './open-month.js';

/** A charge still owed when the month ended. */
export interface OwedCharge {
  readonly month: YearMonth;
  readonly type: ChargeType;
  readonly amount: Money;
}

/** One depto in the report: what it paid in the month and how its account stood at its end. */
export interface UnitReportLine {
  readonly unit: UnitNumber;
  /** Inactive deptos are not charged that month. */
  readonly active: boolean;
  /** The month's payments, added up. */
  readonly paid: Money;
  /** What those payments covered, oldest first ("cubre ago y sep"). */
  readonly covered: readonly PaymentCoverage[];
  /** Adeudo at the end of the month, charge by charge. */
  readonly owed: readonly OwedCharge[];
  readonly outstanding: Money;
  /** Adelanto at the end of the month. */
  readonly credit: Money;
}

/** A row of the book as the report lists it. */
export interface ReportEntry {
  readonly date: LocalDate;
  readonly description: string | null;
  readonly amount: Money;
  /** Garbage rows: the Monday of the week they pay for. */
  readonly week: LocalDate | null;
}

/**
 * Everything the monthly report shows, as plain values: the renderer only lays it out. A
 * closed month reads its frozen snapshot and rows, and its accounts as they stood when it
 * ended, so its report comes out the same every time.
 */
export interface ReportDocument {
  readonly month: YearMonth;
  readonly status: ReportStatus;
  /** Whose shift it is, and who actually answered for it (a delegation may change it). */
  readonly scheduledUnit: UnitNumber;
  readonly responsibleUnits: readonly UnitNumber[];
  readonly openingBalance: Money;
  readonly income: Money;
  readonly expense: Money;
  readonly closingBalance: Money;
  readonly byCategory: CashbookTotals['byCategory'];
  readonly units: readonly UnitReportLine[];
  readonly otherIncome: readonly ReportEntry[];
  readonly garbage: readonly ReportEntry[];
  /** The month's cleaning visits by week (only this month's: the report is cash-basis). */
  readonly cleaning: readonly WeeklyCleaningPayout[];
  readonly otherExpenses: readonly ReportEntry[];
  readonly generatedAt: Instant;
}

/** Port: lays a report out as a PDF. The adapter (react-pdf) lives in infrastructure. */
export interface ReportRenderer {
  render(document: ReportDocument): Promise<Uint8Array>;
}

export const REPORT_RENDERER = Symbol('ReportRenderer');

/**
 * The monthly report as a PDF, for any opened month: closed, as frozen; open, as a draft
 * of what is recorded so far. Everyone can read it (spec 5: full read access).
 */
@Injectable()
export class RenderMonthlyReport {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(REPORT_RENDERER) private readonly renderer: ReportRenderer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly cashbook: ReadCashbook,
    private readonly accounts: GetAccounts,
    private readonly calendars: LoadShiftCalendar,
  ) {}

  async execute(month: YearMonth): Promise<Uint8Array> {
    return this.renderer.render(await this.document(month));
  }

  /** The report's contents, before any layout. */
  async document(month: YearMonth): Promise<ReportDocument> {
    const ledger = requireLedger(await this.reports.loadLedger());
    const report = ledger.report(month);
    const [book, live, statements, calendar] = await Promise.all([
      this.cashbook.month(month),
      liveTotalsOf(this.cashbook, ledger, month),
      this.accounts.all(month),
      this.calendars.execute(month),
    ]);
    const { openingBalance, closingBalance } = ledger.balancesOf(month, live);
    const { income, expense } = report.snapshot ?? live(month);
    const assignment = calendar.assignmentFor(month);
    const rows = book.movements;
    const entries = (category: CashMovement['category']) =>
      rows.filter((row) => row.category === category).map(toEntry);

    return {
      month,
      status: report.status,
      scheduledUnit: assignment.scheduledUnit,
      responsibleUnits: assignment.responsibleUnits,
      openingBalance,
      income,
      expense,
      closingBalance,
      byCategory: book.totals().byCategory,
      units: UnitNumber.all().map((unit) => {
        const payments = rows.filter(
          (row) => row.category === 'UNIT_PAYMENT' && row.details.unit === unit,
        );
        const statement = statements.find((s) => s.unit === unit);
        return {
          unit,
          active: calendar.units.isActive(unit, month),
          paid: Money.sum(payments.map((row) => row.amount)),
          covered: payments.flatMap((row) => statement?.coverageOf(row.id) ?? []),
          owed: (statement?.lines ?? [])
            .filter((line) => line.outstanding.isPositive())
            .map(({ charge, outstanding }) => ({
              month: charge.month,
              type: charge.type,
              amount: outstanding,
            })),
          outstanding: statement?.outstandingBalance ?? Money.ZERO,
          credit: statement?.creditBalance ?? Money.ZERO,
        };
      }),
      otherIncome: entries('OTHER_INCOME'),
      garbage: entries('GARBAGE'),
      cleaning: weeklyCleaningPayouts(rows),
      otherExpenses: entries('OTHER_EXPENSE'),
      generatedAt: this.clock.now(),
    };
  }
}

function toEntry(row: CashMovement): ReportEntry {
  const { date, description, amount, week } = row.details;
  return { date, description, amount, week };
}
