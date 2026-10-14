import type { AuditSubject } from '../../../shared-kernel/index.js';
import type { MonthlyReport, ReportingStart } from '../domain/index.js';

export const ReportAuditAction = {
  START_SET: 'REPORTING_START_SET',
  MONTH_OPENED: 'MONTH_OPENED',
  MONTH_CLOSED: 'MONTH_CLOSED',
  /** A later closed month whose balances moved when an earlier month closed again. */
  MONTH_RESTATED: 'MONTH_RESTATED',
  MONTH_REOPENED: 'MONTH_REOPENED',
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

/** A month's status and, once closed, the figures frozen in its snapshot. */
export const MONTH_AUDIT: AuditSubject<MonthlyReport> = {
  entity: 'monthly_report',
  id: (report) => String(report.month),
  label: (report) => String(report.month),
  snapshot: ({ status, snapshot }) => ({
    status,
    openingBalance: snapshot?.openingBalance.centavos ?? null,
    income: snapshot?.income.centavos ?? null,
    expense: snapshot?.expense.centavos ?? null,
    closingBalance: snapshot?.closingBalance.centavos ?? null,
  }),
};
