import { type ChangePasswordRequest, sessionResponseSchema } from '@depadmin/shared';
import { useMutation } from '@tanstack/react-query';
import { sendJson } from '@/lib/http';
import { useSessionStore } from '@/lib/use-session';

/** The API ends the user's other sessions and answers with a new one for this device. */
export function useChangePassword() {
  const session = useSessionStore();
  return useMutation({
    mutationFn: async (body: ChangePasswordRequest) =>
      session.accept(await sendJson('POST', '/auth/password', body, sessionResponseSchema)),
  });
}
