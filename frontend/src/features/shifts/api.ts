import {
  type CreateDelegationRequest,
  currentShiftResponseSchema,
  shiftCalendarResponseSchema,
  shiftDelegationSchema,
} from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/http';

export const currentShiftQueryOptions = queryOptions({
  queryKey: ['shifts', 'current'],
  queryFn: () => getJson('/shifts/current', currentShiftResponseSchema),
});

export function shiftCalendarQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: ['shifts', 'calendar', from, to],
    queryFn: () =>
      getJson(
        `/shifts/calendar?${new URLSearchParams({ from, to }).toString()}`,
        shiftCalendarResponseSchema,
      ),
  });
}

/** A delegation changes the calendar, the charges and the audit log. */
function useRefreshAfterDelegation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['shifts'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-log'] }),
    ]);
}

export function useDelegateShift() {
  const refresh = useRefreshAfterDelegation();
  return useMutation({
    mutationFn: (body: CreateDelegationRequest) =>
      sendJson('POST', '/shifts/delegations', body, shiftDelegationSchema),
    onSuccess: refresh,
  });
}

export function useCancelDelegation() {
  const refresh = useRefreshAfterDelegation();
  return useMutation({
    mutationFn: (id: string) =>
      sendJson('POST', `/shifts/delegations/${id}/cancel`, undefined, shiftDelegationSchema),
    onSuccess: refresh,
  });
}
