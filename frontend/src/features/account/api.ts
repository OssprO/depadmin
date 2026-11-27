import {
  accountEmailSchema,
  type ChangeEmailRequest,
  type EmailTopic,
  unsubscribeResponseSchema,
} from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/http';

/**
 * The signed-in user's email: the confirmed one and the one waiting (ADR-0033), and the
 * optional emails turned off (ADR-0034).
 */
export const accountEmailQueryOptions = queryOptions({
  queryKey: ['account', 'email'],
  queryFn: () => getJson('/account/email', accountEmailSchema),
});

/** Every change answers with the new state, which replaces the cached one. */
function useEmailMutation<Variables>(send: (variables: Variables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: Variables) => accountEmailSchema.parse(await send(variables)),
    onSuccess: (email) => {
      queryClient.setQueryData(accountEmailQueryOptions.queryKey, email);
      return queryClient.invalidateQueries({ queryKey: ['audit-log'] });
    },
  });
}

/** A new address, or the one waiting again: a confirmation link goes to it. */
export function useChangeEmail() {
  return useEmailMutation((body: ChangeEmailRequest) =>
    sendJson('PUT', '/account/email', body, accountEmailSchema),
  );
}

export function useRemoveEmail() {
  return useEmailMutation(() =>
    sendJson('DELETE', '/account/email', undefined, accountEmailSchema),
  );
}

export function useConfirmEmail() {
  return useEmailMutation((token: string) =>
    sendJson('POST', '/account/email/confirm', { token }, accountEmailSchema),
  );
}

/** Turns an optional email on or off; the security notices always go out. */
export function useChangeEmailTopic() {
  return useEmailMutation(({ topic, receive }: { topic: EmailTopic; receive: boolean }) =>
    sendJson('PUT', `/account/email/topics/${topic}`, { receive }, accountEmailSchema),
  );
}

/** The link at the foot of an optional email, without a session. */
export function useUnsubscribe() {
  return useMutation({
    mutationFn: (token: string) =>
      sendJson(
        'POST',
        `/email/unsubscribe/${encodeURIComponent(token)}`,
        undefined,
        unsubscribeResponseSchema,
      ),
  });
}
