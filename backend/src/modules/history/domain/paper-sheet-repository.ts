import type { YearMonth } from '../../../shared-kernel/index.js';
import type { PaperSheet } from './paper-sheet.js';

/** Port: the paper sheets of the history's months. */
export interface PaperSheetRepository {
  /** Every sheet, or a month's. */
  findSheets(month?: YearMonth): Promise<PaperSheet[]>;
  findSheet(id: string): Promise<PaperSheet | null>;
  saveSheets(sheets: readonly PaperSheet[]): Promise<void>;
  removeSheet(id: string): Promise<void>;
}

export const PAPER_SHEET_REPOSITORY = Symbol('PaperSheetRepository');
