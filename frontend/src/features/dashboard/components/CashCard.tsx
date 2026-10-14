import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { historyQueryOptions, monthQueryOptions } from '@/features/book/api';
import { OpenMonthCard } from '@/features/book/components/OpenMonthCard';
import { buildingToday, formatMoney, formatMonth, formatMonthName } from '@/lib/format';

/**
 * The cash on hand (the newest month's closing balance, live while it is open) and what came
 * in and went out this month. Before the month is opened, it offers to open it.
 */
export function CashCard() {
  const thisMonth = buildingToday().slice(0, 7);
  const history = useQuery(historyQueryOptions);
  const current = useQuery(monthQueryOptions(thisMonth));

  if (history.isPending || current.isPending) {
    return <p className="text-xs/relaxed text-muted-foreground">Cargando la caja…</p>;
  }
  if (history.isError || current.isError) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar la caja.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void Promise.all([history.refetch(), current.refetch()])}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const latest = history.data.months[0];
  const month = current.data;
  return (
    <>
      {month.status === 'NOT_OPENED' && <OpenMonthCard report={month} />}
      {latest && (
        <Card role="region" aria-labelledby="cash">
          <CardHeader>
            <CardTitle>
              <h2 id="cash">Caja</h2>
            </CardTitle>
            <CardDescription>
              {latest.status === 'OPEN'
                ? 'Saldo actual, con lo anotado hasta hoy.'
                : `Saldo al cierre de ${formatMonth(latest.month)}.`}
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" render={<Link to="/book" />}>
                Ver libro
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="font-heading text-2xl font-bold tabular-nums">
              {formatMoney(latest.closingBalance)}
            </p>
            {month.status !== 'NOT_OPENED' && (
              <dl className="flex flex-col gap-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Ingresos de {formatMonthName(month.month)}
                  </dt>
                  <dd className="tabular-nums">+ {formatMoney(month.totals.income)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Egresos de {formatMonthName(month.month)}
                  </dt>
                  <dd className="tabular-nums">− {formatMoney(month.totals.expense)}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
