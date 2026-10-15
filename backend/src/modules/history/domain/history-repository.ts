import type { LocalDate, YearMonth } from '../../../shared-kernel/index.js';
import type { HistoricalBooks } from './historical-books.js';
import type { HistoricalMovement } from './historical-movement.js';
import type { PaperSheet } from './paper-sheet.js';

/** Port: the building's history, kept apart from the live books. */
export interface HistoryRepository {
  /** Null until a history is imported. */
  loadBooks(): Promise<HistoricalBooks | null>;
  saveBooks(books: HistoricalBooks): Promise<void>;

  /** Every sheet, or a month's. */
  findSheets(month?: YearMonth): Promise<PaperSheet[]>;
  findSheet(id: string): Promise<PaperSheet | null>;
  saveSheets(sheets: readonly PaperSheet[]): Promise<void>;
  removeSheet(id: string): Promise<void>;

  /** Every row, or a month's, by date. */
  findMovements(month?: YearMonth): Promise<HistoricalMovement[]>;
  findMovement(id: string): Promise<HistoricalMovement | null>;
  /** The row that paid a week's garbage, if any. */
  findGarbageFor(week: LocalDate): Promise<HistoricalMovement | null>;
  saveMovements(movements: readonly HistoricalMovement[]): Promise<void>;
  removeMovement(id: string): Promise<void>;

  /** Deletes the whole history (only while in review, to import it again). */
  discard(): Promise<void>;
}

export const HISTORY_REPOSITORY = Symbol('HistoryRepository');
