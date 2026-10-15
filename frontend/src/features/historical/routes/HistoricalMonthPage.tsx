import type { HistoricalMonth, HistoricalSheet, Movement } from '@depadmin/shared';
import {
  CaretLeftIcon,
  CaretRightIcon,
  ListBulletsIcon,
  PencilSimpleIcon,
  PlusIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MovementList } from '@/features/book/components/MovementList';
import { formatMoney, formatMonth } from '@/lib/format';
import { historicalMonthQueryOptions } from '../api';
import { GapBadge } from '../components/GapBadge';
import { HistoricalMovementSheet } from '../components/HistoricalMovementSheet';
import { PaperSheetSheet } from '../components/PaperSheetSheet';

type Editing =
  | { kind: 'movement'; movement: Movement | null }
  | { kind: 'sheet'; sheet: HistoricalSheet | null };

const money = (centavos: number | null) => (centavos === null ? '—' : formatMoney(centavos));

/** The month's rows added up, next to what its paper says. */
function FiguresCard({ month }: { month: HistoricalMonth }) {
  const row = (label: string, rows: string, paper: string | null, strong = false) => (
    <tr className={strong ? 'font-medium' : undefined}>
      <th scope="row" className="py-1 text-left font-normal text-muted-foreground">
        {label}
      </th>
      <td className="py-1 text-right tabular-nums">{rows}</td>
      <td className="py-1 text-right tabular-nums">{paper ?? ''}</td>
    </tr>
  );
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Cifras</CardTitle>
        <CardAction>
          <GapBadge gap={month.ownGap} sheets={month.sheets.length} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="sr-only">
                Concepto
              </th>
              <th scope="col" className="text-right font-normal">
                Movimientos
              </th>
              <th scope="col" className="text-right font-normal">
                Papel
              </th>
            </tr>
          </thead>
          <tbody>
            {row('Saldo inicial', formatMoney(month.opening), money(month.paperOpening))}
            {row('Ingresos', `+ ${formatMoney(month.income)}`, null)}
            {row('Egresos', `− ${formatMoney(month.expense)}`, null)}
            {row('Saldo final', formatMoney(month.closing), money(month.paperClosing), true)}
          </tbody>
        </table>
        {month.ownGap !== null && month.ownGap !== 0 && (
          <p>
            Los movimientos del mes dan {formatMoney(Math.abs(month.ownGap))}{' '}
            {month.ownGap > 0 ? 'más' : 'menos'} de lo que movió la hoja: falta, sobra o está mal un
            renglón.
          </p>
        )}
        {month.carriedGap !== null && month.carriedGap !== 0 && (
          <p className="text-muted-foreground">
            Llega con {formatMoney(Math.abs(month.carriedGap))}{' '}
            {month.carriedGap > 0 ? 'más' : 'menos'} de lo que abre el papel, por meses anteriores
            (un mes sin capturar o con diferencia).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SheetCard({
  sheet,
  onEdit,
}: {
  sheet: HistoricalSheet;
  onEdit: (() => void) | undefined;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h2>{sheet.fromDay === 1 ? 'Hoja' : `Hoja desde el día ${sheet.fromDay}`}</h2>
        </CardTitle>
        <CardDescription>{sheet.source}</CardDescription>
        {onEdit && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <PencilSimpleIcon /> Corregir
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground tabular-nums">
          Abre {money(sheet.opening)} · + {money(sheet.income)} · − {money(sheet.expense)} · cierra{' '}
          {money(sheet.closing)}
        </p>
        {sheet.alerts.map((alert) => (
          <Alert key={alert}>
            <WarningIcon />
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        ))}
        {sheet.notes.length > 0 && (
          <dl className="flex flex-col gap-1">
            {sheet.notes.map((note) => (
              <div key={note.unit} className="grid grid-cols-[4rem_1fr] gap-2">
                <dt className="font-medium">Depto {note.unit}</dt>
                <dd>{note.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

/** One month of the history, to check against its paper and correct while in review. */
export function HistoricalMonthPage({ month }: { month: string }) {
  const query = useQuery(historicalMonthQueryOptions(month));
  const [editing, setEditing] = useState<Editing | null>(null);
  const data = query.data;
  const canEdit = data?.canEdit ?? false;

  const step = (target: string | null | undefined, label: string, icon: ReactNode) =>
    target ? (
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        render={<Link to="/admin/history/$month" params={{ month: target }} />}
      >
        {icon}
      </Button>
    ) : (
      <span className="size-8" />
    );

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        {step(data?.previous, 'Mes anterior', <CaretLeftIcon />)}
        <h1 className="font-heading text-lg font-bold first-letter:uppercase">
          {formatMonth(month)}
        </h1>
        {step(data?.next, 'Mes siguiente', <CaretRightIcon />)}
      </div>
      {query.isPending && <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>}
      {query.isError && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar el mes.</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {data && (
        <>
          <FiguresCard month={data} />
          {data.sheets.length === 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  <h2>Sin hoja</h2>
                </CardTitle>
                <CardDescription>
                  No hay papel de este mes. Cuando aparezca, agrega la hoja con sus cifras y captura
                  sus movimientos.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {data.sheets.map((sheet) => (
            <SheetCard
              key={sheet.id}
              sheet={sheet}
              onEdit={canEdit ? () => setEditing({ kind: 'sheet', sheet }) : undefined}
            />
          ))}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setEditing({ kind: 'sheet', sheet: null })}
            >
              <PlusIcon /> Agregar hoja
            </Button>
          )}
          <h2 className="font-heading font-bold">Movimientos</h2>
          <MovementList
            movements={data.movements}
            showCoverage={false}
            onSelect={
              canEdit ? (movement) => setEditing({ kind: 'movement', movement }) : undefined
            }
          />
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        render={<Link to="/admin/history" />}
      >
        <ListBulletsIcon /> Todos los meses del historial
      </Button>

      {canEdit && (
        <Button
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] shadow-lg"
          onClick={() => setEditing({ kind: 'movement', movement: null })}
        >
          <PlusIcon /> Agregar
        </Button>
      )}
      {editing?.kind === 'movement' && (
        <HistoricalMovementSheet
          key={editing.movement?.id ?? 'new'}
          month={month}
          movement={editing.movement}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'sheet' && (
        <PaperSheetSheet
          key={editing.sheet?.id ?? 'new'}
          month={month}
          sheet={editing.sheet}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
