import {
  type CleaningVisitsRequest,
  type MovementRequest,
  monthHistorySchema,
  monthlyReportSchema,
  openMonthResponseSchema,
} from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, getJson, sendJson } from '@/lib/http';

export function monthQueryOptions(month: string) {
  return queryOptions({
    queryKey: ['months', month],
    queryFn: () => getJson(`/months/${month}`, monthlyReportSchema),
  });
}

/** Every opened month, newest first. Under the same key as the months, so it refreshes with them. */
export const historyQueryOptions = queryOptions({
  queryKey: ['months'],
  queryFn: () => getJson('/months', monthHistorySchema),
});

/**
 * Any change to the books moves balances (in later months too), accounts and the audit log,
 * so all of them are refreshed.
 */
function useRefreshBooks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['months'], ['accounts'], ['audit-log']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useOpenMonth() {
  const refresh = useRefreshBooks();
  return useMutation({
    mutationFn: (month: string) =>
      sendJson('POST', `/months/${month}/open`, undefined, openMonthResponseSchema),
    onSuccess: refresh,
  });
}

/** The month's report as a PDF file, ready to download or share. */
export async function fetchReportPdf(month: string): Promise<File> {
  const response = await apiFetch(`/months/${month}/report.pdf`);
  return new File([await response.blob()], `reporte-${month}.pdf`, { type: 'application/pdf' });
}

export function useCloseMonth() {
  const refresh = useRefreshBooks();
  return useMutation({
    mutationFn: async (month: string) => {
      await apiFetch(`/months/${month}/close`, { method: 'POST' });
    },
    onSuccess: refresh,
  });
}

export function useReopenMonth() {
  const refresh = useRefreshBooks();
  return useMutation({
    mutationFn: async (month: string) => {
      await apiFetch(`/months/${month}/reopen`, { method: 'POST' });
    },
    onSuccess: refresh,
  });
}

export function useAddMovement() {
  const refresh = useRefreshBooks();
  return useMutation({
    mutationFn: (body: MovementRequest) =>
      sendJson('POST', '/movements', body, z.object({ id: z.uuid() })),
    onSuccess: refresh,
  });
}

export function useReviseMovement() {
  const refresh = useRefreshBooks();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: MovementRequest }) => {
      await apiFetch(`/movements/${id}`, { method: 'PUT', body });
    },
    onSuccess: refresh,
  });
}

export function useRemoveMovement() {
  const refresh = useRefreshBooks();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/movements/${id}`, { method: 'DELETE' });
    },
    onSuccess: refresh,
  });
}

export function useRecordCleaningVisits() {
  const refresh = useRefreshBooks();
  return useMutation({
    mutationFn: (body: CleaningVisitsRequest) =>
      sendJson('POST', '/movements/cleaning-visits', body, z.object({ ids: z.array(z.uuid()) })),
    onSuccess: refresh,
  });
}
