import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatMonth } from '@/lib/format';
import { accountQueryOptions } from '../api';

const TYPES = { MAINTENANCE_FEE: 'Cuota', SHIFT_SKIP_PENALTY: 'Multa por no tomar turno' } as const;
const STATUS = {
  PAID: { label: 'Pagado', variant: 'outline' },
  PARTIAL: { label: 'Abono', variant: 'secondary' },
  UNPAID: { label: 'Pendiente', variant: 'destructive' },
} as const;

/** One depto's charges, newest first, with what has been paid towards each. */
export function AccountStatementPage({ unit }: { unit: number }) {
  const account = useQuery(accountQueryOptions(unit));
  const data = account.data;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Depto {unit}</h1>
      {account.isPending && <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>}
      {account.isError && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar la cuenta.</p>
          <Button variant="outline" size="sm" onClick={() => void account.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {data && (
        <>
          <Card size="sm">
            <CardContent>
              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-muted-foreground">Adeudo</dt>
                  <dd className="text-sm font-bold tabular-nums">
                    {formatMoney(data.outstanding)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Adelanto</dt>
                  <dd className="text-sm font-bold tabular-nums">{formatMoney(data.credit)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Cargos</CardTitle>
            </CardHeader>
            <CardContent>
              {data.lines.length === 0 ? (
                <p className="text-muted-foreground">Sin cargos todavía.</p>
              ) : (
                <ul className="divide-y">
                  {[...data.lines].reverse().map((line) => (
                    <li key={`${line.month}-${line.type}`} className="flex items-center gap-3 py-2">
                      <span className="flex flex-1 flex-col">
                        <span className="font-medium first-letter:uppercase">
                          {formatMonth(line.month)}
                        </span>
                        <span className="text-muted-foreground">{TYPES[line.type]}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1 tabular-nums">
                        <span>{formatMoney(line.amount)}</span>
                        <Badge variant={STATUS[line.status].variant}>
                          {line.status === 'PARTIAL'
                            ? `Falta ${formatMoney(line.outstanding)}`
                            : STATUS[line.status].label}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
