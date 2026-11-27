import { noticeSchema, noticesResponseSchema, type PublishNoticeRequest } from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getJson, sendJson } from '@/lib/http';

/** Every notice standing, newest first, with what the caller has read (ADR-0034). */
export const noticesQueryOptions = queryOptions({
  queryKey: ['notices'],
  queryFn: () => getJson('/notices', noticesResponseSchema),
});

/** A change shows in the notices and in the audit log. */
function useRefreshNotices(alsoAudit: boolean) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [noticesQueryOptions.queryKey, ...(alsoAudit ? [['audit-log']] : [])].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function usePublishNotice() {
  const refresh = useRefreshNotices(true);
  return useMutation({
    mutationFn: (body: PublishNoticeRequest) => sendJson('POST', '/notices', body, noticeSchema),
    onSuccess: refresh,
  });
}

export function useWithdrawNotice() {
  const refresh = useRefreshNotices(true);
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/notices/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

/** Reading is not audited. */
export function useMarkNoticesRead() {
  const refresh = useRefreshNotices(false);
  return useMutation({
    mutationFn: (ids: readonly string[]) =>
      apiFetch('/notices/read', { method: 'POST', body: { ids } }),
    onSuccess: refresh,
  });
}
