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
}

export const MONTH_LEDGER = Symbol('MonthLedger');
