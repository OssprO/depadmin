import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  ConflictError,
  creationOf,
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
 * Opens a month so its rows can be recorded, and charges its fees. Months open in order, so
 * any earlier month not opened yet is opened first, each with its own fees. It belongs to
 * whoever can write the month (its responsible owner, or the superadmin), and is idempotent.
 */
@Injectable()
export class OpenMonth {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly calendars: LoadShiftCalendar,
    private readonly fees: ChargeMaintenanceFees,
  ) {}

  async execute(actor: Actor, month: YearMonth): Promise<MonthlyReport[]> {
    const today = this.clock.today();
    this.policy.assertCanWrite({
      actor,
      month,
      today,
      responsibility: await this.calendars.execute(month),
    });
    return this.unitOfWork.run(async () => {
      const ledger = requireLedger(await this.reports.loadLedger());
      const blocker = openingBlocker(ledger, month, today.yearMonth);
      if (blocker) throw blocker;

      const opened: MonthlyReport[] = [];
      while (!ledger.nextMonth.isAfter(month)) {
        const report = ledger.openMonth(ledger.nextMonth);
        await this.reports.save([report]);
        await this.audit.record(
          actor,
          creationOf(MONTH_AUDIT, ReportAuditAction.MONTH_OPENED, report),
        );
        await this.fees.execute(actor, report.month);
        opened.push(report);
      }
      return opened;
    });
  }
}
