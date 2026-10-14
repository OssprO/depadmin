import { auditLogPageSchema } from '@depadmin/shared';
import { infiniteQueryOptions } from '@tanstack/react-query';
import { getJson } from '@/lib/http';
import { type AuditLogFilters, auditLogSearchParams } from './filters';

/** The log, newest first, one page at a time; each page brings the cursor of the next. */
export function auditLogQueryOptions(filters: AuditLogFilters) {
  return infiniteQueryOptions({
    queryKey: ['audit-log', filters],
    queryFn: ({ pageParam }) => {
      const params = auditLogSearchParams(filters, pageParam);
      const query = params.size > 0 ? `?${params.toString()}` : '';
      return getJson(`/audit-log${query}`, auditLogPageSchema);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
