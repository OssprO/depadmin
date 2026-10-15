import type { HistorySummary } from '@depadmin/shared';
import { CaretRightIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages';
import { formatMoney, formatMonth, formatMonthName } from '@/lib/format';
import { historyStateQueryOptions, useDiscardHistory } from '../api';
import { GapBadge } from '../components/GapBadge';
import { ImportHistoryCard } from '../components/ImportHistoryCard';

function Cutover({ history }: { history: HistorySummary }) {
  const { cutover } = history;
  if (!cutover) {
    return (
      <p className="text-muted-foreground">
        Cuando captures el{' '}
        <Link to="/admin/start" className="underline underline-offset-4">
          inicio de la contabilidad
        </Link>
        , aquí se compara el efectivo de ese mes con el cierre del historial.
      </p>
    );
  }
  if (cutover.difference === null) {
    return (
      <p className="text-muted-foreground">
        Los libros empiezan en {formatMonth(cutover.month)}: entre el historial y ellos hay meses
        sin registrar.
      </p>
    );
  }
  return (
    <p className={cutover.difference === 0 ? 'text-muted-foreground' : 'font-medium'}>
      {formatMonth(cutover.month)} empieza con {formatMoney(cutover.openingBalance)} en caja
      {cutover.difference === 0
        ? ', igual que el cierre del historial.'
        : `: ${formatMoney(Math.abs(cutover.difference))} ${cutover.difference > 0 ? 'más' : 'menos'} que el cierre del historial.`}
    </p>
  );
}

function SummaryCard({ history }: { history: HistorySummary }) {
  const months = history.months;
  const ok = months.filter((month) => month.sheets > 0 && month.ownGap === 0).length;
  const off = months.filter((month) => month.ownGap !== null && month.ownGap !== 0).length;
  const missing = months.filter((month) => month.sheets === 0).length;
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
        <CardAction>
          <Badge variant={history.status === 'IN_REVIEW' ? 'default' : 'secondary'}>
            {history.status === 'IN_REVIEW' ? 'En revisión' : 'Verificado'}
          </Badge>
        </CardAction>
        <CardDescription>
          Compara cada mes con su hoja y corrígelo. Mientras esté en revisión solo tú lo ves, y nada
          de esto va a la bitácora.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col gap-1">
          {line(
            `Caja al empezar ${formatMonth(history.firstMonth)}`,
            formatMoney(history.openingBalance),
          )}
          {line(`Cierre de ${formatMonth(history.lastMonth)}`, formatMoney(history.closing))}
          {line('Meses que cuadran con su hoja', `${ok} de ${months.length}`)}
          {line('Meses con diferencia', String(off))}
          {line('Meses sin hoja', String(missing))}
        </dl>
        <Cutover history={history} />
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
                  to="/admin/history/$month"
                  params={{ month: month.month }}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium first-letter:uppercase">
                        {formatMonthName(month.month)}
                      </span>
                      <GapBadge gap={month.ownGap} sheets={month.sheets} />
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

function DiscardHistory() {
  const discard = useDiscardHistory();
  const [error, setError] = useState<string | null>(null);
  return (
    <AlertDialog onOpenChange={() => setError(null)}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="self-start" />}>
        Descartar el historial
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Descartar todo el historial?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran todos sus meses, hojas y movimientos, también lo que hayas corregido, para
            importar un archivo nuevo. No se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={discard.isPending}
            onClick={() =>
              discard.mutate(undefined, { onError: (failure) => setError(errorMessage(failure)) })
            }
          >
            Sí, descartarlo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The building's history before the platform (ADR-0022): imported from the transcription of
 * the paper sheets and reviewed by the superadmin, month by month.
 */
export function HistoryReviewPage() {
  const state = useQuery(historyStateQueryOptions);
  const history = state.data?.history;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Historial</h1>
      {state.isPending && <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>}
      {state.isError && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar el historial.</p>
          <Button variant="outline" size="sm" onClick={() => void state.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {state.isSuccess && !history && <ImportHistoryCard />}
      {history && (
        <>
          <SummaryCard history={history} />
          <MonthList history={history} />
          {history.status === 'IN_REVIEW' && <DiscardHistory />}
        </>
      )}
    </div>
  );
}
