import { Global, Module } from '@nestjs/common';
import { PAPER_RECORD } from '../../shared-kernel/index.js';
import { CashbookModule } from '../cashbook/cashbook.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { UnitsModule } from '../units/units.module.js';
import {
  AddPaperSheet,
  GetHistory,
  GetPaperMonth,
  ImportHistory,
  PaperSheetAccess,
  PreviewHistoryImport,
  RemovePaperSheet,
  RevisePaperSheet,
  SheetPaperRecord,
} from './application/index.js';
import { PAPER_SHEET_REPOSITORY } from './domain/index.js';
import { HistoryController } from './http/history.controller.js';
import { PrismaPaperSheetRepository } from './infrastructure/prisma-paper-sheet.repository.js';

/**
 * Global for one thing only: the `PAPER_RECORD` port, which the reports module asks
 * without importing this module (it reads the reports, so importing it back would be a cycle).
 */
@Global()
@Module({
  imports: [ReportsModule, CashbookModule, SettingsModule, UnitsModule],
  controllers: [HistoryController],
  providers: [
    { provide: PAPER_SHEET_REPOSITORY, useClass: PrismaPaperSheetRepository },
    SheetPaperRecord,
    { provide: PAPER_RECORD, useExisting: SheetPaperRecord },
    PaperSheetAccess,
    GetHistory,
    GetPaperMonth,
    PreviewHistoryImport,
    ImportHistory,
    AddPaperSheet,
    RevisePaperSheet,
    RemovePaperSheet,
  ],
  exports: [PAPER_RECORD],
})
export class HistoryModule {}
