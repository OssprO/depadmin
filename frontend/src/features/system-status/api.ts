import { healthResponseSchema } from '@depadmin/shared';
import { queryOptions } from '@tanstack/react-query';
import { getJson } from '@/lib/http';

export const healthQueryOptions = queryOptions({
  queryKey: ['health'],
  queryFn: () => getJson('/health', healthResponseSchema),
  refetchInterval: 30_000,
});
