import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  type MonthAccessRequest,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { ReadCashbook } from '../../cashbook/application/index.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import {
  type MonthlyReport,
  REPORT_REPOSITORY,
  type ReportLedger,
  type ReportRepository,
} from '../domain/index.js';
import { liveTotalsOf } from './live-totals.js';
import { requireLedger } from './open-month.js';
import { MONTH_AUDIT, ReportAuditAction } from './report-audit.js';

const policy = new WriteAccessPolicy();

/** Whether the caller can close the month now: what the screens ask before offering it. */
export function mayClose(ledger: ReportLedger, request: MonthAccessRequest): boolean {
  return (
    ledger.closingBlocker(request.month, request.today) === null && policy.decide(request).allowed
  );
}

/**
 * Closes a month once it is over: its rows freeze and its figures are stored as a snapshot,
 * which the history and the PDF read from then on. The outgoing owner closes their own
 * months within their window (the handover); the superadmin can close any. Closing again a
 * month the superadmin reopened restates the later closed months, which are audited too.
 *
 * Pending garbage weeks do not block it: the screen warns before closing, since a week may
 * have been paid in another month or not at all.
 */
@Injectable()
export class CloseMonth {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly calendars: LoadShiftCalendar,
    private readonly cashbook: ReadCashbook,
  ) {}

  /** Returns every report that changed: the month, then the later ones restated. */
  async execute(actor: Actor, month: YearMonth): Promise<MonthlyReport[]> {
    const today = this.clock.today();
    policy.assertCanClose({
      actor,
      month,
      today,
      responsibility: await this.calendars.execute(month),
    });
    return this.unitOfWork.run(async () => {
      const ledger = requireLedger(await this.reports.loadLedger());
      const blocker = ledger.closingBlocker(month, today);
      if (blocker) throw blocker;

      // Any month from this one on may change; remember them all as they were.
      const before = new Map(
        ledger.reports
          .filter((report) => !report.month.isBefore(month))
          .map((report) => [String(report.month), trackChanges(MONTH_AUDIT, report)]),
      );
      const changed = ledger.closeMonth(
        month,
        await liveTotalsOf(this.cashbook, ledger, month),
        today,
      );
      await this.reports.save(changed);
      for (const report of changed) {
        const action = report.month.equals(month)
          ? ReportAuditAction.MONTH_CLOSED
          : ReportAuditAction.MONTH_RESTATED;
        const change = before.get(String(report.month))?.change(action);
        // A restated month whose balances came out the same changed nothing.
        if (change && change.changes.length > 0) await this.audit.record(actor, change);
      }
      return changed;
    });
  }
}
