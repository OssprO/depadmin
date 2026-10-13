import { Module } from '@nestjs/common';
import { REPORT_REPOSITORY } from './domain/index.js';
import { PrismaReportRepository } from './infrastructure/prisma-report.repository.js';

@Module({
  providers: [{ provide: REPORT_REPOSITORY, useClass: PrismaReportRepository }],
  exports: [REPORT_REPOSITORY],
})
export class ReportsModule {}
