import { Global, Module } from '@nestjs/common';
import { MONTH_LEDGER } from '../../shared-kernel/index.js';
import { BillingModule } from '../billing/billing.module.js';
import { CashbookModule } from '../cashbook/cashbook.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { ShiftsModule } from '../shifts/shifts.module.js';
import {
  CloseMonth,
  GetAccounts,
  GetMonthHistory,
  GetMonthlyReport,
  GetOpeningBalances,
  GetReportingStart,
  MonthOpening,
  OpenCurrentMonth,
  OpenMonth,
  RenderMonthlyReport,
  ReopenMonth,
  REPORT_RENDERER,
  ReportMonthLedger,
  SetOpeningBalance,
  SetReportingStart,
  StartBooksWithHistory,
} from './application/index.js';
import { REPORT_REPOSITORY } from './domain/index.js';
import { ReportsController } from './http/reports.controller.js';
import { ReactPdfReportRenderer } from './infrastructure/pdf/react-pdf-report-renderer.js';
import { PrismaReportRepository } from './infrastructure/prisma-report.repository.js';
import { OpenCurrentMonthJob } from './jobs/open-current-month.job.js';

/**
 * Global for one thing only: the `MONTH_LEDGER` port, which the cashbook and units modules
 * ask without importing this module (it reads them, so importing it back would be a cycle).
 * It asks the `PAPER_RECORD` port the same way, which the history module provides.
 */
@Global()
@Module({
  imports: [CashbookModule, BillingModule, ShiftsModule, SettingsModule],
  controllers: [ReportsController],
  providers: [
    { provide: REPORT_REPOSITORY, useClass: PrismaReportRepository },
    { provide: REPORT_RENDERER, useClass: ReactPdfReportRenderer },
    ReportMonthLedger,
    { provide: MONTH_LEDGER, useExisting: ReportMonthLedger },
    SetReportingStart,
    StartBooksWithHistory,
    GetReportingStart,
    MonthOpening,
    OpenMonth,
    OpenCurrentMonth,
    CloseMonth,
    ReopenMonth,
    GetMonthlyReport,
    GetMonthHistory,
    RenderMonthlyReport,
    GetAccounts,
    GetOpeningBalances,
    SetOpeningBalance,
    OpenCurrentMonthJob,
  ],
  exports: [MONTH_LEDGER, GetReportingStart, StartBooksWithHistory, GetMonthHistory],
})
export class ReportsModule {}
