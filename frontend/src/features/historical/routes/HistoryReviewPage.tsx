import type { HistorySummary } from '@depadmin/shared';
import { CaretRightIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { reportingStartQueryOptions } from '@/features/admin/api';
import { formatMoney, formatMonth, formatMonthName } from '@/lib/format';
import { historyStateQueryOptions } from '../api';
import { GapBadge } from '../components/GapBadge';
import { ImportHistoryCard } from '../components/ImportHistoryCard';

function SummaryCard({ history }: { history: HistorySummary }) {
  const months = history.months;
  const ok = months.filter((month) => month.sheets > 0 && month.ownGap === 0).length;
  const off = months.filter((month) => month.ownGap !== null && month.ownGap !== 0).length;
  const missing = months.filter((month) => month.sheets === 0).length;
  const closed = months.filter((month) => month.status === 'CLOSED').length;
  const line = (label: string, value: string) => (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {formatMonth(history.firstMonth)} a {formatMonth(history.lastMonth)}
        </CardTitle>
        <CardDescription>
          Abre cada mes en el Libro, compáralo con su hoja y corrígelo; al cerrarlo queda revisado.
          Lo que captures en estos meses no va a la bitácora.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col gap-1">
          {line(
            `Caja al empezar ${formatMonth(history.firstMonth)}`,
            formatMoney(history.openingBalance),
          )}
          {line(`Cierre de ${formatMonth(history.lastMonth)}`, formatMoney(history.closing))}
          {line('Meses revisados (cerrados)', `${closed} de ${months.length}`)}
          {line('Meses que cuadran con su hoja', String(ok))}
          {line('Meses con diferencia', String(off))}
          {line('Meses sin hoja', String(missing))}
        </dl>
        <p className="text-muted-foreground">
          {formatMonth(history.cutover)} abre con el cierre de {formatMonth(history.lastMonth)}, y
          desde ahí siguen los libros en vivo.
        </p>
      </CardContent>
    </Card>
  );
}

function MonthList({ history }: { history: HistorySummary }) {
  const years = [...new Set(history.months.map((month) => month.month.slice(0, 4)))];
  return years.map((year) => (
    <Card key={year} size="sm">
      <CardHeader>
        <CardTitle>
          <h2>{year}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {history.months
            .filter((month) => month.month.startsWith(year))
            .map((month) => (
              <li key={month.month}>
                <Link
                  to="/book/$month"
                  params={{ month: month.month }}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium first-letter:uppercase">
                        {formatMonthName(month.month)}
                      </span>
                      <GapBadge gap={month.ownGap} sheets={month.sheets} />
                      {month.status === 'CLOSED' && <Badge variant="secondary">Cerrado</Badge>}
                      {month.alerts > 0 && (
                        <Badge variant="outline">
                          {month.alerts} {month.alerts === 1 ? 'alerta' : 'alertas'}
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      + {formatMoney(month.income)} · − {formatMoney(month.expense)}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-medium">{formatMoney(month.closing)}</span>
                    <span className="text-muted-foreground">saldo final</span>
                  </span>
                  <CaretRightIcon className="text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  ));
}

/**
 * The building's history (ADR-0023): the books start with it, imported from the
 * transcription of the paper sheets, and the superadmin checks it month by month.
 */
export function HistoryReviewPage() {
  const state = useQuery(historyStateQueryOptions);
  const start = useQuery(reportingStartQueryOptions);
  const history = state.data?.history;
  const loading = state.isPending || start.isPending;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Historial</h1>
      {loading && <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>}
      {(state.isError || start.isError) && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar el historial.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void Promise.all([state.refetch(), start.refetch()])}
          >
            Reintentar
          </Button>
        </div>
      )}
      {state.isSuccess && start.isSuccess && !history && !start.data.start && <ImportHistoryCard />}
      {state.isSuccess && start.isSuccess && !history && start.data.start && (
        <p className="text-muted-foreground">
          Los libros ya empezaron en {formatMonth(start.data.start.month)} sin historial. El
          historial solo se importa antes de empezar los libros.
        </p>
      )}
      {history && (
        <>
          <SummaryCard history={history} />
          <MonthList history={history} />
        </>
      )}
    </div>
  );
}
