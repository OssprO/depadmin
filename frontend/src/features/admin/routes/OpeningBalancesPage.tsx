import type { OpeningBalance } from '@depadmin/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/http';
import { formatMoney, formatMonth } from '@/lib/format';
import { openingBalancesQueryOptions } from '../api';
import { OpeningBalanceSheet } from '../components/OpeningBalanceSheet';

function summary(balance: OpeningBalance): string {
  const debt = balance.debts.reduce((sum, d) => sum + d.amount, 0);
  const parts = [
    debt > 0 && `debía ${formatMoney(debt)}`,
    balance.credit > 0 && `adelanto ${formatMoney(balance.credit)}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'al corriente';
}

/**
 * The initial load (PLAN question 7): what each depto owed or had paid ahead when the books
 * started, taken from the last report shared before the app.
 */
export function OpeningBalancesPage() {
  const opening = useQuery(openingBalancesQueryOptions);
  const [editing, setEditing] = useState<OpeningBalance | null>(null);
  const notStarted =
    opening.error instanceof ApiError && opening.error.code === 'REPORTING_NOT_STARTED';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Carga inicial</h1>
      {opening.isPending && <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>}
      {notStarted && (
        <Card>
          <CardHeader>
            <CardTitle>Primero, el inicio de la contabilidad</CardTitle>
            <CardDescription>
              Los adeudos y adelantos son de antes del primer mes de los libros.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/admin/start" />}>Capturar el inicio</Button>
          </CardContent>
        </Card>
      )}
      {opening.isError && !notStarted && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar.</p>
          <Button variant="outline" size="sm" onClick={() => void opening.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {opening.isSuccess && (
        <Card>
          <CardHeader>
            <CardTitle>Adeudos y adelantos al empezar</CardTitle>
            <CardDescription>
              Lo que cada depto debía o tenía adelantado antes de {formatMonth(opening.data.start)},
              como lo dice el último reporte compartido. No mueve el efectivo en caja.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {opening.data.locked && (
              <Alert>
                <AlertDescription>
                  {formatMonth(opening.data.start)} ya se cerró, así que esto quedó fijo. Para
                  corregirlo, reabre ese mes.
                </AlertDescription>
              </Alert>
            )}
            <ul className="divide-y">
              {opening.data.balances.map((balance) => (
                <li key={balance.unit} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex flex-col">
                    <span className="font-medium">Depto {balance.unit}</span>
                    <span className="text-muted-foreground">{summary(balance)}</span>
                  </span>
                  {!opening.data.locked && (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Editar Depto ${balance.unit}`}
                      onClick={() => setEditing(balance)}
                    >
                      Editar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {editing && opening.data && (
        <OpeningBalanceSheet
          key={editing.unit}
          balance={editing}
          start={opening.data.start}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
