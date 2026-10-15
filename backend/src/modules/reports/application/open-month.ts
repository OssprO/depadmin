import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  type ChangeAuthor,
  CLOCK,
  type Clock,
  ConflictError,
  creationOf,
  SYSTEM_ACTOR,
  UNIT_OF_WORK,
  type UnitOfWork,
  ValidationError,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { ChargeMaintenanceFees } from '../../billing/application/index.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import {
  type MonthlyReport,
  REPORT_REPOSITORY,
  type ReportLedger,
  type ReportRepository,
} from '../domain/index.js';
import { MONTH_AUDIT, ReportAuditAction } from './report-audit.js';

/** The books, once the superadmin has set where they start. */
export function requireLedger(ledger: ReportLedger | null): ReportLedger {
  if (!ledger) {
    throw new ConflictError('REPORTING_NOT_STARTED', 'Set where the books start first');
  }
  return ledger;
}

/** Why a month cannot be opened yet, or null if it can (or already is). */
export function openingBlocker(
  ledger: ReportLedger,
  month: YearMonth,
  today: YearMonth,
): ConflictError | ValidationError | null {
  if (month.isBefore(ledger.start.month)) {
    return new ValidationError(
      'MONTH_BEFORE_START',
      `The books start in ${ledger.start.month}; ${month} is earlier`,
    );
  }
  if (month.isAfter(today)) {
    return new ConflictError('MONTH_NOT_STARTED', `${month} has not started yet`);
  }
  return null;
}

/**
 * Opens every month not opened yet up to `month`, in order, each with its own fees. Shared by
 * the owner's button and the daily job; whoever calls it has already decided it may.
 */
@Injectable()
export class MonthOpening {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    private readonly fees: ChargeMaintenanceFees,
  ) {}

  through(author: ChangeAuthor, month: YearMonth, today: YearMonth): Promise<MonthlyReport[]> {
    return this.unitOfWork.run(async () => {
      const ledger = requireLedger(await this.reports.loadLedger());
      const blocker = openingBlocker(ledger, month, today);
      if (blocker) throw blocker;

      const opened: MonthlyReport[] = [];
      while (!ledger.nextMonth.isAfter(month)) {
        const report = ledger.openMonth(ledger.nextMonth);
        await this.reports.save([report]);
        opened.push(report);
        // A month of the history has no fees, and stays out of the log (ADR-0023).
        if (ledger.isHistory(report.month)) continue;
        await this.audit.record(
          author,
          creationOf(MONTH_AUDIT, ReportAuditAction.MONTH_OPENED, report),
        );
        await this.fees.execute(author, report.month);
      }
      return opened;
    });
  }
}

/**
 * Opens a month so its rows can be recorded, and charges its fees. Months open in order, so
 * any earlier month not opened yet is opened first, each with its own fees. It belongs to
 * whoever can write the month (its responsible owner, or the superadmin), and is idempotent.
 */
@Injectable()
export class OpenMonth {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly calendars: LoadShiftCalendar,
    private readonly opening: MonthOpening,
  ) {}

  async execute(actor: Actor, month: YearMonth): Promise<MonthlyReport[]> {
    const today = this.clock.today();
    this.policy.assertCanWrite({
      actor,
      month,
      today,
      responsibility: await this.calendars.execute(month),
    });
    return this.opening.through(actor, month, today.yearMonth);
  }
}

/**
 * The daily fallback (PLAN question 3): opens the current month, and any earlier one still
 * unopened, if nobody did, so the fees are charged on time. The app is the author in the
 * audit log. It does nothing before the books start, or while they start in a later month.
 */
@Injectable()
export class OpenCurrentMonth {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly opening: MonthOpening,
  ) {}

  async execute(): Promise<MonthlyReport[]> {
    const today = this.clock.today().yearMonth;
    const ledger = await this.reports.loadLedger();
    if (!ledger || openingBlocker(ledger, today, today)) return [];
    return this.opening.through(SYSTEM_ACTOR, today, today);
  }
}
