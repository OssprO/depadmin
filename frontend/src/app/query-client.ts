import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/http';

/** Client errors (4xx) will not fix themselves on a retry; network and server errors might. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
      },
    },
  });
}
