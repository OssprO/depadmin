import {
  type CleaningVisitsRequest,
  type MovementRequest,
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
