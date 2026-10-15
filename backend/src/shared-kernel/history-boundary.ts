import type { YearMonth } from './year-month.js';

/**
 * Port: the last month of the building's history (the months before the platform). The live
 * books start after it, so no month is in both. The history module answers it; the reports
 * module asks without importing it, since the history reads the reports (cycle-free, like
 * `MonthLedger`).
 */
export interface HistoryBoundary {
  /** Null while no history has been imported. */
  lastMonth(): Promise<YearMonth | null>;
}

export const HISTORY_BOUNDARY = Symbol('HistoryBoundary');
