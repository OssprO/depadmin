import {
  type AddSheetRequest,
  historicalMonthSchema,
  type HistoryFile,
  historyPreviewSchema,
  historyStateSchema,
  type MovementRequest,
  type SheetRequest,
} from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, getJson, sendJson } from '@/lib/http';

// The building's history (ADR-0022): the months before the platform, in review by the
// superadmin. Every change moves the balances of later months, so all of it is refreshed.

export const historyStateQueryOptions = queryOptions({
  queryKey: ['history'],
  queryFn: () => getJson('/history', historyStateSchema),
});

export function historicalMonthQueryOptions(month: string) {
  return queryOptions({
    queryKey: ['history', month],
    queryFn: () => getJson(`/history/months/${month}`, historicalMonthSchema),
  });
}

function useRefreshHistory(...also: string[][]) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['history'], ...also].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

/** Checks the file and adds it up; saves nothing. */
export function usePreviewHistory() {
  return useMutation({
    mutationFn: (file: HistoryFile) =>
      sendJson('POST', '/history/preview', file, historyPreviewSchema),
  });
}

/** The import also sets the owners' names, which show in the deptos and the audit log. */
export function useImportHistory() {
  const refresh = useRefreshHistory(['units'], ['audit-log']);
  return useMutation({
    mutationFn: async (file: HistoryFile) => {
      await apiFetch('/history', { method: 'POST', body: file });
    },
    onSuccess: refresh,
  });
}

export function useDiscardHistory() {
  const refresh = useRefreshHistory();
  return useMutation({
    mutationFn: async () => {
      await apiFetch('/history', { method: 'DELETE' });
    },
    onSuccess: refresh,
  });
}

export function useAddHistoricalMovement() {
  const refresh = useRefreshHistory();
  return useMutation({
    mutationFn: (body: MovementRequest) =>
      sendJson('POST', '/history/movements', body, z.object({ id: z.uuid() })),
    onSuccess: refresh,
  });
}

export function useReviseHistoricalMovement() {
  const refresh = useRefreshHistory();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: MovementRequest }) => {
      await apiFetch(`/history/movements/${id}`, { method: 'PUT', body });
    },
    onSuccess: refresh,
  });
}

export function useRemoveHistoricalMovement() {
  const refresh = useRefreshHistory();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/history/movements/${id}`, { method: 'DELETE' });
    },
    onSuccess: refresh,
  });
}

export function useAddSheet() {
  const refresh = useRefreshHistory();
  return useMutation({
    mutationFn: (body: AddSheetRequest) =>
      sendJson('POST', '/history/sheets', body, z.object({ id: z.uuid() })),
    onSuccess: refresh,
  });
}

export function useReviseSheet() {
  const refresh = useRefreshHistory();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: SheetRequest }) => {
      await apiFetch(`/history/sheets/${id}`, { method: 'PUT', body });
    },
    onSuccess: refresh,
  });
}

export function useRemoveSheet() {
  const refresh = useRefreshHistory();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/history/sheets/${id}`, { method: 'DELETE' });
    },
    onSuccess: refresh,
  });
}
