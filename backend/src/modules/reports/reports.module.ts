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
  GetReportingStart,
  MonthOpening,
  OpenCurrentMonth,
  OpenMonth,
  ReopenMonth,
  ReportMonthLedger,
  SetReportingStart,
} from './application/index.js';
import { REPORT_REPOSITORY } from './domain/index.js';
import { ReportsController } from './http/reports.controller.js';
import { PrismaReportRepository } from './infrastructure/prisma-report.repository.js';
import { OpenCurrentMonthJob } from './jobs/open-current-month.job.js';

/**
 * Global for one thing only: the `MONTH_LEDGER` port, which the cashbook and units modules
 * ask without importing this module (it reads them, so importing it back would be a cycle).
 */
@Global()
@Module({
  imports: [CashbookModule, BillingModule, ShiftsModule, SettingsModule],
  controllers: [ReportsController],
  providers: [
    { provide: REPORT_REPOSITORY, useClass: PrismaReportRepository },
    ReportMonthLedger,
    { provide: MONTH_LEDGER, useExisting: ReportMonthLedger },
    SetReportingStart,
    GetReportingStart,
    MonthOpening,
    OpenMonth,
    OpenCurrentMonth,
    CloseMonth,
    ReopenMonth,
    GetMonthlyReport,
    GetMonthHistory,
    GetAccounts,
    OpenCurrentMonthJob,
  ],
  exports: [MONTH_LEDGER],
})
export class ReportsModule {}
