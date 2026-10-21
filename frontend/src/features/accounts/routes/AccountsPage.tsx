import { CaretRightIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { useCurrentUser } from '@/lib/use-session';
import { cn } from '@/lib/utils';
import { accountsQueryOptions } from '../api';

/** Every depto's adeudo and adelanto, as the monthly report shows them. */
export function AccountsPage() {
  const user = useCurrentUser();
  const accounts = useQuery(accountsQueryOptions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Estados de cuenta</h1>
      <Card>
        <CardHeader>
          <CardTitle>Adeudos y adelantos</CardTitle>
          <CardDescription>
            Cada pago cubre primero lo más antiguo. Toca un depto para ver su detalle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.isPending && <p className="text-muted-foreground">Cargando…</p>}
          {accounts.isError && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground">No se pudieron cargar las cuentas.</p>
              <Button variant="outline" size="sm" onClick={() => void accounts.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {accounts.isSuccess && (
            <ul className="divide-y">
              {accounts.data.map((account) => (
                <li key={account.unit}>
                  <Link
                    to="/accounts/$unit"
                    params={{ unit: account.unit }}
                    className={cn(
                      'flex items-center gap-3 py-2.5',
                      account.unit === user.unit && 'font-medium',
                    )}
                  >
                    <span className="flex-1">
                      Depto {account.unit}
                      {account.unit === user.unit && ' (tú)'}
                    </span>
                    <span className="text-right tabular-nums">
                      {account.outstanding > 0 ? (
                        <span className="text-destructive">
                          debe {formatMoney(account.outstanding)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">al corriente</span>
                      )}
                      {account.credit > 0 && (
                        <span className="block text-muted-foreground">
                          adelanto {formatMoney(account.credit)}
                        </span>
                      )}
                    </span>
                    <CaretRightIcon className="text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
