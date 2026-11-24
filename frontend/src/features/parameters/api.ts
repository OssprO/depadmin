import {
  type RateChangeParams,
  type RateChangeRequest,
  rateChangeSchema,
  ratesResponseSchema,
} from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getJson, sendJson } from '@/lib/http';

export const ratesQueryOptions = queryOptions({
  queryKey: ['rates'],
  queryFn: () => getJson('/rates', ratesResponseSchema),
});

/** A change shows in the rates, in the book's suggested amounts and in the audit log. */
function useRefreshRates() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [ratesQueryOptions.queryKey, ['months'], ['audit-log']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useChangeRate() {
  const refresh = useRefreshRates();
  return useMutation({
    mutationFn: (body: RateChangeRequest) =>
      sendJson('POST', '/rates/changes', body, rateChangeSchema),
    onSuccess: refresh,
  });
}

export function useWithdrawRateChange() {
  const refresh = useRefreshRates();
  return useMutation({
    mutationFn: ({ rate, from }: RateChangeParams) =>
      apiFetch(`/rates/changes/${rate}/${from}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}
