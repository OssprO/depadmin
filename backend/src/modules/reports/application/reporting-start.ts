import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  ConflictError,
  creationOf,
  type Money,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  ValidationError,
  WriteAccessPolicy,
} from '../../../shared-kernel/index.js';
import { ListOpeningBalances } from '../../billing/application/index.js';
import {
  type MonthlyReport,
  REPORT_REPOSITORY,
  type ReportingStart,
  ReportLedger,
  type ReportRepository,
} from '../domain/index.js';
import { REPORTING_START_AUDIT, ReportAuditAction } from './report-audit.js';

@Injectable()
export class GetReportingStart {
  constructor(@Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository) {}

  async execute(): Promise<ReportingStart | null> {
    return (await this.reports.loadLedger())?.start ?? null;
  }
}

/** What the superadmin sets: the first month and the cash on hand at its beginning. */
export interface StartRequest {
  readonly month: ReportingStart['month'];
  readonly openingBalance: Money;
}

/**
 * The superadmin sets where the books start: the first month and the cash on hand at its
 * beginning; without a history, the cut-over is that same month. The month is fixed once a
 * month has been opened, or once opening balances (dated before it) have been recorded, and
 * always when the books start with the building's history (it comes from the import); the
 * cash can be corrected until the first month is closed, since nothing has been frozen from
 * it yet.
 */
@Injectable()
export class SetReportingStart {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    private readonly openingBalances: ListOpeningBalances,
  ) {}

  async execute(actor: Actor, request: StartRequest): Promise<ReportingStart> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const ledger = await this.reports.loadLedger();
      const withHistory = ledger && ledger.isHistory(ledger.start.month);
      const start: ReportingStart = {
        ...request,
        cutover: withHistory ? ledger.start.cutover : request.month,
      };
      if (withHistory && !ledger.start.month.equals(start.month)) {
        throw new ConflictError(
          'REPORTING_START_LOCKED',
          `The books start in ${ledger.start.month} with the building's history`,
        );
      }
      if (ledger) {
        const opened = ledger.reports.length > 0;
        if (opened && !ledger.start.month.equals(start.month)) {
          throw new ConflictError(
            'REPORTING_START_LOCKED',
            `The books already start in ${ledger.start.month}`,
          );
        }
        const moved = !ledger.start.month.equals(start.month);
        if (moved && (await this.hasOpeningBalances(ledger.start.month))) {
          throw new ConflictError(
            'OPENING_BALANCES_SET',
            'Clear the opening balances before moving the start: they are dated before it',
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

  private async hasOpeningBalances(start: ReportingStart['month']): Promise<boolean> {
    return (await this.openingBalances.execute(start)).some((balance) => !balance.isEmpty);
  }
}

/**
 * The books start with the building's history (the import, ADR-0023): from its first month
 * and opening cash, with every month of it opened so it can be checked against its paper.
 * The months before the cut-over charge no fees and leave nothing in the audit log: the
 * log starts with the cut-over, and the history is checked by closing its months. Called by
 * the history module inside its unit of work; it needs books that have not started.
 */
@Injectable()
export class StartBooksWithHistory {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, start: ReportingStart): Promise<MonthlyReport[]> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      if (await this.reports.loadLedger()) {
        throw new ConflictError(
          'BOOKS_ALREADY_STARTED',
          'The books have already started; the history comes in only before them',
        );
      }
      if (!start.cutover.isAfter(start.month)) {
        throw new ValidationError('HISTORY_FILE_INVALID', 'The history has no months');
      }
      const lastMonth = start.cutover.previous();
      if (!lastMonth.isBefore(this.clock.today().yearMonth)) {
        throw new ConflictError('MONTH_NOT_STARTED', `${lastMonth} is not over yet`);
      }
      await this.reports.saveStart(start);
      const ledger = ReportLedger.restore(start, []);
      const opened = start.month.through(lastMonth).map((month) => ledger.openMonth(month));
      await this.reports.save(opened);
      return opened;
    });
  }
}
