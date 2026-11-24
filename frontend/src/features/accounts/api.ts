import { accountListResponseSchema, accountStatementSchema } from '@depadmin/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch, getJson } from '@/lib/http';

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

const pdf = async (path: string, name: string) =>
  new File([await (await apiFetch(path)).blob()], name, { type: 'application/pdf' });

/** "0042", as the folio reads on the receipt. */
export const folioLabel = (folio: number) => String(folio).padStart(4, '0');

/** A depto payment's receipt. */
export const fetchReceipt = (paymentId: string, folio: number) =>
  pdf(`/movements/${paymentId}/receipt.pdf`, `recibo-${folioLabel(folio)}.pdf`);

/** A depto's account statement, today or as a closed month ended. */
export const fetchStatement = (unit: number, through: string | null) =>
  pdf(
    `/accounts/${unit}/statement.pdf${through ? `?through=${through}` : ''}`,
    `estado-de-cuenta-${unit}${through ? `-${through}` : ''}.pdf`,
  );
