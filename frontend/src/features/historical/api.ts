import {
  type AddSheetRequest,
  type HistoryFile,
  historyPreviewSchema,
  historyStateSchema,
  paperMonthSchema,
  type SheetRequest,
} from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, getJson, sendJson } from '@/lib/http';

// The building's history (ADR-0023): the months of the books transcribed from paper, and
// their sheets. Its rows go through the book like any month's.

export const historyStateQueryOptions = queryOptions({
  queryKey: ['history'],
  queryFn: () => getJson('/history', historyStateSchema),
});

/** A month of the history next to its sheets. */
export function paperMonthQueryOptions(month: string) {
  return queryOptions({
    queryKey: ['history', month],
    queryFn: () => getJson(`/history/months/${month}`, paperMonthSchema),
  });
}

/** Checks the file and adds it up; saves nothing. */
export function usePreviewHistory() {
  return useMutation({
    mutationFn: (file: HistoryFile) =>
      sendJson('POST', '/history/preview', file, historyPreviewSchema),
  });
}

/**
 * The import starts the books and sets the owners' names, which show in the deptos and the
 * audit log: everything is refreshed.
 */
export function useImportHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: HistoryFile) => {
      await apiFetch('/history', { method: 'POST', body: file });
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

function useRefreshSheets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['history'] });
}

export function useAddSheet() {
  const refresh = useRefreshSheets();
  return useMutation({
    mutationFn: (body: AddSheetRequest) =>
      sendJson('POST', '/history/sheets', body, z.object({ id: z.uuid() })),
    onSuccess: refresh,
  });
}

export function useReviseSheet() {
  const refresh = useRefreshSheets();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: SheetRequest }) => {
      await apiFetch(`/history/sheets/${id}`, { method: 'PUT', body });
    },
    onSuccess: refresh,
  });
}

export function useRemoveSheet() {
  const refresh = useRefreshSheets();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/history/sheets/${id}`, { method: 'DELETE' });
    },
    onSuccess: refresh,
  });
}
