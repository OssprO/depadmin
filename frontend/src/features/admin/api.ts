import { passwordResetResponseSchema, userListResponseSchema } from '@depadmin/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/http';

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
