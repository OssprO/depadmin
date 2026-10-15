import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  DomainError,
  type Instant,
  LocalDate,
  Money,
  UnitNumber,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import type {
  AccountStatement,
  ChargeType,
  PaymentCoverage,
} from '../../billing/application/index.js';
import {
  type CashbookTotals,
  type CashMovement,
  type GarbageWeek,
  ReadCashbook,
  type WeeklyCleaningPayout,
  weeklyCleaningPayouts,
  weeksWithinBooks,
} from '../../cashbook/application/index.js';
import { GetRates } from '../../settings/application/index.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import { REPORT_REPOSITORY, type ReportRepository, type ReportStatus } from '../domain/index.js';
import { GetAccounts } from './accounts.js';
import { liveTotalsOf } from './live-totals.js';
import { requireLedger } from './open-month.js';

/** A charge still owed when the month ended. */
export interface OwedCharge {
  readonly month: YearMonth;
  readonly type: ChargeType;
  /** What was still owed of it. */
  readonly amount: Money;
  /** A whole month's fee is owed (nothing paid of it, and it was the regular fee). */
  readonly whole: boolean;
}

/** The month's own fee, and how it was paid by the end of the month. */
export interface CurrentFee {
  readonly amount: Money;
  /** By the month's payments ("mes en curso"). */
  readonly paidThisMonth: Money;
  /** By earlier payments (an adelanto), and the month of the latest of them. */
  readonly paidBefore: Money;
  readonly paidBeforeIn: YearMonth | null;
  readonly outstanding: Money;
}

/** One depto in the report: what it paid in the month and how its account stood at its end. */
export interface UnitReportLine {
  readonly unit: UnitNumber;
  readonly ownerName: string | null;
  /** Inactive deptos are not charged that month. */
  readonly active: boolean;
  /** Null when the depto had no fee that month (inactive). */
  readonly currentFee: CurrentFee | null;
  /** The month's payments, added up. */
  readonly paid: Money;
  /** The part of the month's payments that covered nothing yet: a new adelanto. */
  readonly advanced: Money;
  /** What those payments covered, oldest first ("cubre ago y sep"). */
  readonly covered: readonly PaymentCoverage[];
  /** Adeudo at the end of the month, charge by charge. */
  readonly owed: readonly OwedCharge[];
  readonly outstanding: Money;
  /** Adelanto at the end of the month. */
  readonly credit: Money;
}

/** A garbage week in the report: paid by a row of the month, or still unpaid at its end. */
export interface GarbageWeekLine {
  /** Monday. */
  readonly week: LocalDate;
  /** Null for a week of the month nobody had paid by its end. */
  readonly amount: Money | null;
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
  /** The fee in force that month, to tell how many months an adelanto covers. */
  readonly maintenanceFee: Money | null;
  readonly units: readonly UnitReportLine[];
  readonly otherIncome: readonly ReportEntry[];
  /** By week: the month's garbage rows, and its weeks left unpaid. */
  readonly garbage: readonly GarbageWeekLine[];
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
    private readonly rates: GetRates,
  ) {}

  async execute(month: YearMonth): Promise<Uint8Array> {
    return this.renderer.render(await this.document(month));
  }

  /** The fee in force in the month; null before any rate is set. */
  private async feeFor(month: YearMonth): Promise<Money | null> {
    try {
      return (await this.rates.forMonth(month)).maintenanceFee;
    } catch (error) {
      if (error instanceof DomainError) return null;
      throw error;
    }
  }

  /** The report's contents, before any layout. */
  async document(month: YearMonth): Promise<ReportDocument> {
    const ledger = requireLedger(await this.reports.loadLedger());
    const report = ledger.report(month);
    const [book, live, statements, calendar, weeks, maintenanceFee] = await Promise.all([
      this.cashbook.month(month),
      liveTotalsOf(this.cashbook, ledger, month),
      this.accounts.all(month),
      this.calendars.execute(month),
      this.cashbook.garbageWeeks(month, this.clock.today()),
      this.feeFor(month),
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
      maintenanceFee,
      units: UnitNumber.all().map((unit) => {
        const payments = rows.filter(
          (row) => row.category === 'UNIT_PAYMENT' && row.details.unit === unit,
        );
        const paid = Money.sum(payments.map((row) => row.amount));
        const statement = statements.find((s) => s.unit === unit);
        const covered = payments.flatMap((row) => statement?.coverageOf(row.id) ?? []);
        return {
          unit,
          ownerName: calendar.units.ownerOf(unit),
          active: calendar.units.isActive(unit, month),
          currentFee: statement ? currentFeeOf(statement, month, payments) : null,
          paid,
          advanced: paid.minus(Money.sum(covered.map((part) => part.amount))),
          covered,
          owed: (statement?.lines ?? [])
            .filter((line) => line.outstanding.isPositive())
            .map(({ charge, outstanding, paid: paidOff }) => ({
              month: charge.month,
              type: charge.type,
              amount: outstanding,
              whole:
                paidOff.isZero() && maintenanceFee !== null && outstanding.equals(maintenanceFee),
            })),
          outstanding: statement?.outstandingBalance ?? Money.ZERO,
          credit: statement?.creditBalance ?? Money.ZERO,
        };
      }),
      otherIncome: entries('OTHER_INCOME'),
      garbage: garbageOf(month, rows, weeksWithinBooks(weeks, ledger.start.month)),
      cleaning: weeklyCleaningPayouts(rows),
      otherExpenses: entries('OTHER_EXPENSE'),
      generatedAt: this.clock.now(),
    };
  }
}

/** How the month's own fee was paid by its end, or null if it had none (inactive). */
function currentFeeOf(
  statement: AccountStatement,
  month: YearMonth,
  payments: readonly CashMovement[],
): CurrentFee | null {
  const line = statement.lines.find(
    ({ charge }) => charge.month.equals(month) && charge.type === 'MAINTENANCE_FEE',
  );
  if (!line) return null;
  const ids = new Set(payments.map((row) => row.id));
  const funding = statement.fundingOf(line.charge);
  const earlier = funding.filter(({ payment }) => !ids.has(payment.id));
  return {
    amount: line.charge.amount,
    paidThisMonth: Money.sum(
      funding.filter(({ payment }) => ids.has(payment.id)).map(({ amount }) => amount),
    ),
    paidBefore: Money.sum(earlier.map(({ amount }) => amount)),
    paidBeforeIn: earlier.at(-1)?.payment.date.yearMonth ?? null,
    outstanding: line.outstanding,
  };
}

/**
 * The month's garbage rows by the week they paid, plus the month's weeks still unpaid when
 * it ended (blank in the report). A week paid in another month is that month's expense.
 */
function garbageOf(
  month: YearMonth,
  rows: readonly CashMovement[],
  weeks: readonly GarbageWeek[],
): GarbageWeekLine[] {
  const end = LocalDate.lastOf(month);
  const paid: GarbageWeekLine[] = rows
    .filter((row) => row.category === 'GARBAGE' && row.details.week)
    .map((row) => ({ week: row.details.week as LocalDate, amount: row.amount }));
  const unpaid: GarbageWeekLine[] = weeks
    .filter(({ paidBy }) => !paidBy || paidBy.date.isAfter(end))
    .map(({ week }) => ({ week, amount: null }));
  return [...paid, ...unpaid].sort((a, b) => a.week.compareTo(b.week));
}

function toEntry(row: CashMovement): ReportEntry {
  const { date, description, amount, week } = row.details;
  return { date, description, amount, week };
}
