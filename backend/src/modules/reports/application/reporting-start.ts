import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  ConflictError,
  creationOf,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  WriteAccessPolicy,
} from '../../../shared-kernel/index.js';
import { REPORT_REPOSITORY, type ReportingStart, type ReportRepository } from '../domain/index.js';
import { REPORTING_START_AUDIT, ReportAuditAction } from './report-audit.js';

@Injectable()
export class GetReportingStart {
  constructor(@Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository) {}

  async execute(): Promise<ReportingStart | null> {
    return (await this.reports.loadLedger())?.start ?? null;
  }
}

/**
 * The superadmin sets where the books start: the first month and the cash on hand at its
 * beginning. The month is fixed once a month has been opened; the cash can be corrected
 * until the first month is closed, since nothing has been frozen from it yet.
 */
@Injectable()
export class SetReportingStart {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(actor: Actor, start: ReportingStart): Promise<ReportingStart> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const ledger = await this.reports.loadLedger();
      if (ledger) {
        const opened = ledger.reports.length > 0;
        if (opened && !ledger.start.month.equals(start.month)) {
          throw new ConflictError(
            'REPORTING_START_LOCKED',
            `The books already start in ${ledger.start.month}`,
          );
        }
        if (ledger.reports.some((report) => !report.isOpen)) {
          throw new ConflictError(
            'REPORTING_START_LOCKED',
            'A month has been closed; its opening balance is frozen',
          );
        }
      }
      await this.reports.saveStart(start);
      const change = ledger
        ? trackChanges(REPORTING_START_AUDIT, ledger.start).change(
            ReportAuditAction.START_SET,
            start,
          )
        : creationOf(REPORTING_START_AUDIT, ReportAuditAction.START_SET, start);
      await this.audit.record(actor, change);
      return start;
    });
  }
}
