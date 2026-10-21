import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  type MonthlyReport,
  REPORT_REPOSITORY,
  type ReportRepository,
  type ReportStatus,
} from '../domain/index.js';
import { requireLedger } from './open-month.js';
import { MONTH_AUDIT, ReportAuditAction } from './report-audit.js';

/** Whether the caller can reopen a month in this status: only the superadmin, once closed. */
export function mayReopen(actor: Actor, status: ReportStatus | 'NOT_OPENED'): boolean {
  return actor.role === 'SUPERADMIN' && status === 'CLOSED';
}

/**
 * The superadmin reopens a closed month to fix it: its snapshot is dropped and its rows can
 * be edited again (by the superadmin, or by its owner if still within their window). Its
 * balances are live until it closes again, which restates the later closed months.
 */
@Injectable()
export class ReopenMonth {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(actor: Actor, month: YearMonth): Promise<MonthlyReport> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const ledger = requireLedger(await this.reports.loadLedger());
      const tracked = trackChanges(MONTH_AUDIT, ledger.report(month));
      const report = ledger.reopenMonth(month);
      await this.reports.save([report]);
      await this.audit.record(actor, tracked.change(ReportAuditAction.MONTH_REOPENED));
      return report;
    });
  }
}
