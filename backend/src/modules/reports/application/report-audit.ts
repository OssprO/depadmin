import type { AuditSubject } from '../../../shared-kernel/index.js';
import type { MonthlyReport, ReportingStart } from '../domain/index.js';

export const ReportAuditAction = {
  START_SET: 'REPORTING_START_SET',
  MONTH_OPENED: 'MONTH_OPENED',
} as const;

/** Where the books start; there is only one. */
export const REPORTING_START_AUDIT: AuditSubject<ReportingStart> = {
  entity: 'reporting_start',
  id: () => '1',
  label: (start) => String(start.month),
  snapshot: (start) => ({
    month: String(start.month),
    openingBalance: start.openingBalance.centavos,
  }),
};

export const MONTH_AUDIT: AuditSubject<MonthlyReport> = {
  entity: 'monthly_report',
  id: (report) => String(report.month),
  label: (report) => String(report.month),
  snapshot: (report) => ({ status: report.status }),
};
