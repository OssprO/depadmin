import { Inject, Injectable } from '@nestjs/common';
import type { MonthLedger, MonthStatus, YearMonth } from '../../../shared-kernel/index.js';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/index.js';

/** Answers the shared `MonthLedger` port for the other modules. */
@Injectable()
export class ReportMonthLedger implements MonthLedger {
  constructor(@Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository) {}

  async statusOf(month: YearMonth): Promise<MonthStatus> {
    const ledger = await this.reports.loadLedger();
    const report = ledger?.reports.find((r) => r.month.equals(month));
    if (!report) return 'NOT_OPENED';
    return report.isOpen ? 'OPEN' : 'CLOSED';
  }
}
