import {
  passwordResetResponseSchema,
  type ReportingStart,
  reportingStartResponseSchema,
  type SetUnitStatusRequest,
  unitListResponseSchema,
  unitSchema,
  userListResponseSchema,
} from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getJson, sendJson } from '@/lib/http';

export const usersQueryOptions = queryOptions({
  queryKey: ['users'],
  queryFn: () => getJson('/users', userListResponseSchema),
});

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      sendJson('POST', `/users/${userId}/password-reset`, undefined, passwordResetResponseSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryOptions.queryKey }),
  });
}

export const unitsQueryOptions = queryOptions({
  queryKey: ['units'],
  queryFn: () => getJson('/units', unitListResponseSchema),
});

/** A depto's status changes who answers for its shift, so the calendar is refreshed too. */
export function useSetUnitStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ unit, ...body }: SetUnitStatusRequest & { unit: number }) =>
      sendJson('POST', `/units/${unit}/status`, body, unitSchema),
    onSuccess: () =>
      Promise.all(
        [['units'], ['shifts'], ['audit-log']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export const reportingStartQueryOptions = queryOptions({
  queryKey: ['reporting-start'],
  queryFn: () => getJson('/reporting-start', reportingStartResponseSchema),
});

/** Every balance hangs from the start, so the books are refreshed too. */
export function useSetReportingStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReportingStart) => {
      await apiFetch('/reporting-start', { method: 'PUT', body });
    },
    onSuccess: () =>
      Promise.all(
        [['reporting-start'], ['months'], ['audit-log']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
