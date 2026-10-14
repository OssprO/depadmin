import type { YearMonth } from '../../../shared-kernel/index.js';
import type { MonthlyReport } from './monthly-report.js';
import type { ReportingStart, ReportLedger } from './report-ledger.js';

export interface ReportRepository {
  /** `null` until the initial load sets the reporting start. */
  loadLedger(): Promise<ReportLedger | null>;
  saveStart(start: ReportingStart): Promise<void>;
  save(reports: readonly MonthlyReport[]): Promise<void>;
  /**
   * Locks the month's report row until the transaction ends: shared while rows are written,
   * exclusive while it closes. Writers and the close then wait for each other.
   */
  lockMonth(month: YearMonth, mode: 'shared' | 'exclusive'): Promise<void>;
}

export const REPORT_REPOSITORY = Symbol('ReportRepository');
