import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { createAppRouter } from './router';

interface AppProps {
  readonly router: ReturnType<typeof createAppRouter>;
  readonly queryClient: QueryClient;
}

export function App({ router, queryClient }: AppProps) {
  const { session } = router.options.context;

  // When the session ends behind the scenes (expired, revoked, signed out in another
  // device), drop cached data and re-run the guards, which send the user to the login.
  useEffect(
    () =>
      session.subscribe(() => {
        if (session.getSnapshot().status === 'anonymous') {
          queryClient.clear();
          void router.invalidate();
        }
      }),
    [session, queryClient, router],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
