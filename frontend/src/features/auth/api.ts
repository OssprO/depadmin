import {
  type ChangePasswordRequest,
  type CompleteRecoveryRequest,
  passwordRecoveryAvailabilitySchema,
  type PasswordRecoveryRequest,
  recoveryLinkResponseSchema,
  sessionResponseSchema,
} from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getJson, sendJson } from '@/lib/http';
import { useSessionStore } from '@/lib/use-session';

/** The API ends the user's other sessions and answers with a new one for this device. */
export function useChangePassword() {
  const session = useSessionStore();
  return useMutation({
    mutationFn: async (body: ChangePasswordRequest) =>
      session.accept(await sendJson('POST', '/auth/password', body, sessionResponseSchema)),
  });
}

/** Whether the login offers «¿Olvidaste tu contraseña?»: only once emails go out. */
export const recoveryAvailabilityQueryOptions = queryOptions({
  queryKey: ['password-recovery'],
  queryFn: () => getJson('/auth/password-recovery', passwordRecoveryAvailabilitySchema),
  staleTime: 5 * 60 * 1000,
});

/** Answered the same whether a link went out or not. */
export function useRequestRecovery() {
  return useMutation({
    mutationFn: async (body: PasswordRecoveryRequest) => {
      await apiFetch('/auth/password-recovery', { method: 'POST', body });
    },
  });
}

/** The account a recovery link is for, or an error if it no longer works. */
export const recoveryLinkQueryOptions = (token: string) =>
  queryOptions({
    queryKey: ['password-recovery', 'link', token],
    queryFn: () =>
      sendJson('POST', '/auth/password-recovery/check', { token }, recoveryLinkResponseSchema),
    retry: false,
    staleTime: Infinity,
  });

export function useCompleteRecovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CompleteRecoveryRequest) => {
      await apiFetch('/auth/password-recovery/complete', { method: 'POST', body });
    },
    // The link is used up: opening it again must ask the API, not remember it worked.
    onSuccess: () => queryClient.removeQueries({ queryKey: ['password-recovery', 'link'] }),
  });
}
