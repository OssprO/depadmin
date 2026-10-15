import { Global, Module } from '@nestjs/common';
import { HISTORY_BOUNDARY } from '../../shared-kernel/index.js';
import { ReportsModule } from '../reports/reports.module.js';
import { UnitsModule } from '../units/units.module.js';
import {
  AddHistoricalMovement,
  AddPaperSheet,
  DiscardHistory,
  GetHistoricalMonth,
  GetHistory,
  HistoryAccess,
  ImportHistory,
  PastHistoryBoundary,
  PreviewHistoryImport,
  RemoveHistoricalMovement,
  RemovePaperSheet,
  ReviseHistoricalMovement,
  RevisePaperSheet,
} from './application/index.js';
import { HISTORY_REPOSITORY } from './domain/index.js';
import { HistoryController } from './http/history.controller.js';
import { PrismaHistoryRepository } from './infrastructure/prisma-history.repository.js';

/**
 * Global for one thing only: the `HISTORY_BOUNDARY` port, which the reports module asks
 * without importing this module (it reads the reports, so importing it back would be a cycle).
 */
@Global()
@Module({
  imports: [ReportsModule, UnitsModule],
  controllers: [HistoryController],
  providers: [
    { provide: HISTORY_REPOSITORY, useClass: PrismaHistoryRepository },
    PastHistoryBoundary,
    { provide: HISTORY_BOUNDARY, useExisting: PastHistoryBoundary },
    HistoryAccess,
    GetHistory,
    GetHistoricalMonth,
    PreviewHistoryImport,
    ImportHistory,
    DiscardHistory,
    AddHistoricalMovement,
    ReviseHistoricalMovement,
    RemoveHistoricalMovement,
    AddPaperSheet,
    RevisePaperSheet,
    RemovePaperSheet,
  ],
  exports: [HISTORY_BOUNDARY],
})
export class HistoryModule {}
