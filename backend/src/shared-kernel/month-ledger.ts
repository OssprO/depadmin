import type { YearMonth } from './year-month.js';

/**
 * - `NOT_OPENED`: nothing can be recorded yet (and depto status may still change).
 * - `OPEN`: its rows can be added, revised and removed.
 * - `CLOSED`: frozen; only the superadmin can reopen it.
 */
export type MonthStatus = 'NOT_OPENED' | 'OPEN' | 'CLOSED';

/**
 * Port: the state of each month's books. The reports module answers it; other modules ask
 * through this port instead of importing reports, which reads them back (cycle-free).
 */
export interface MonthLedger {
  statusOf(month: YearMonth): Promise<MonthStatus>;
  /**
   * Keeps the month from being closed until the current unit of work ends, so a row written
   * meanwhile cannot miss the closing snapshot. Call it inside the unit of work, before
   * checking that the month is open; a close already under way finishes first.
   */
  holdOpen(month: YearMonth): Promise<void>;
  /**
   * The first month the platform keeps live: from it on there are fees, accounts, shifts and
   * audit. The months before it, back to the start of the books, are the building's history,
   * transcribed from its paper sheets (ADR-0023). Null until the books start.
   */
  cutover(): Promise<YearMonth | null>;
}

export const MONTH_LEDGER = Symbol('MonthLedger');
