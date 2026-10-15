import { CaretRightIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatMonth } from '@/lib/format';
import { historyQueryOptions } from '../api';

/**
 * Every month since the books started, newest first. A closed month shows the figures frozen
 * when it was closed; an open one, its live figures. Each opens its book.
 */
export function HistoryPage() {
  const history = useQuery(historyQueryOptions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Histórico</h1>
      {history.isPending && <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>}
      {history.isError && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar el histórico.</p>
          <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {history.isSuccess && history.data.months.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay meses</CardTitle>
            <CardDescription>
              {history.data.reportingStarted
                ? 'Aparecen aquí en cuanto se abre el primero.'
                : 'Primero el superadmin captura el inicio de la contabilidad.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {history.isSuccess && history.data.months.length > 0 && (
        <Card>
          <CardContent>
            <ul className="divide-y">
              {history.data.months.map((entry) => (
                <li key={entry.month}>
                  <Link
                    to="/book/$month"
                    params={{ month: entry.month }}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium first-letter:uppercase">
                          {formatMonth(entry.month)}
                        </span>
                        {entry.canClose ? (
                          <Badge>Por cerrar</Badge>
                        ) : (
                          <Badge variant={entry.status === 'OPEN' ? 'outline' : 'secondary'}>
                            {entry.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                          </Badge>
                        )}
                        {/* Before the platform: captured from its paper sheet. */}
                        {entry.historical && <Badge variant="outline">Del papel</Badge>}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        + {formatMoney(entry.income)} · − {formatMoney(entry.expense)}
                      </span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="block font-medium">{formatMoney(entry.closingBalance)}</span>
                      <span className="text-muted-foreground">
                        {entry.status === 'OPEN' ? 'saldo actual' : 'saldo final'}
                      </span>
                    </span>
                    <CaretRightIcon className="text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
