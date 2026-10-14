import { accountListResponseSchema, accountStatementSchema } from '@depadmin/shared';
import { queryOptions } from '@tanstack/react-query';
import { getJson } from '@/lib/http';

export const accountsQueryOptions = queryOptions({
  queryKey: ['accounts'],
  queryFn: () => getJson('/accounts', accountListResponseSchema),
});

export function accountQueryOptions(unit: number) {
  return queryOptions({
    queryKey: ['accounts', unit],
    queryFn: () => getJson(`/accounts/${unit}`, accountStatementSchema),
  });
}
