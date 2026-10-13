import type { MonthlyReport } from './monthly-report.js';
import type { ReportingStart, ReportLedger } from './report-ledger.js';

export interface ReportRepository {
  /** `null` until the initial load sets the reporting start. */
  loadLedger(): Promise<ReportLedger | null>;
  saveStart(start: ReportingStart): Promise<void>;
  save(reports: readonly MonthlyReport[]): Promise<void>;
}

export const REPORT_REPOSITORY = Symbol('ReportRepository');
