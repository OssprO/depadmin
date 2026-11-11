import type { Movement } from '@depadmin/shared';
import { CaretLeftIcon, CaretRightIcon, ListBulletsIcon, PlusIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWideScreen } from '@/lib/use-media-query';
import { PaperCard } from '@/features/historical/components/PaperCard';
import { addMonths, buildingToday, formatMonth, formatMonthName } from '@/lib/format';
import { monthQueryOptions } from '../api';
import { MonthClosingCard } from '../components/MonthClosingCard';
import { MonthSummary } from '../components/MonthSummary';
import { MovementList } from '../components/MovementList';
import { CleaningCard } from '../components/CleaningCard';
import { CleaningVisitsSheet } from '../components/CleaningVisitsSheet';
import { MovementSheet, type MovementPreset } from '../components/MovementSheet';
import { OpenMonthCard } from '../components/OpenMonthCard';
import { PendingGarbage } from '../components/PendingGarbage';
import { ReportPdfActions } from '../components/ReportPdfActions';

/** What is open over the page: a row's form (new or existing) or the cleaning calendar. */
type Editing =
  | { kind: 'movement'; movement: Movement }
  | { kind: 'new'; preset: MovementPreset }
  | { kind: 'visits' };

/**
 * The month's book: the summary on top and every row below. It is the turn admin's main
 * screen, and read-only for everyone else. A month of the building's history shows its
 * paper sheet too, to check one against the other.
 */
export function BookPage({ month }: { month: string }) {
  const report = useQuery(monthQueryOptions(month));
  const [editing, setEditing] = useState<Editing | null>(null);
  const thisMonth = buildingToday().slice(0, 7);
  const data = report.data;
  const canWrite = data?.canWrite ?? false;
  // On the phone the button floats within reach of the thumb; wider, it heads the rows.
  const wide = useWideScreen();
  const addButton = (
    <Button
      className={
        wide ? undefined : 'fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] shadow-lg'
      }
      aria-keyshortcuts="N"
      title="Agregar (tecla N)"
      onClick={() => setEditing({ kind: 'new', preset: { category: 'UNIT_PAYMENT' } })}
    >
      <PlusIcon /> Agregar
    </Button>
  );

  // With a keyboard, N adds a row, unless something is already open or being typed in.
  useEffect(() => {
    if (!canWrite || editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (event.key.toLowerCase() !== 'n' || typing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      setEditing({ kind: 'new', preset: { category: 'UNIT_PAYMENT' } });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canWrite, editing]);

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mes anterior"
          render={<Link to="/book/$month" params={{ month: addMonths(month, -1) }} />}
        >
          <CaretLeftIcon />
        </Button>
        <h1 className="font-heading text-lg font-bold first-letter:uppercase">
          {formatMonth(month)}
        </h1>
        {month < thisMonth ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mes siguiente"
            render={<Link to="/book/$month" params={{ month: addMonths(month, 1) }} />}
          >
            <CaretRightIcon />
          </Button>
        ) : (
          <span className="size-8" />
        )}
      </div>

      {report.isPending && <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>}
      {report.isError && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar el mes.</p>
          <Button variant="outline" size="sm" onClick={() => void report.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {data && data.status === 'NOT_OPENED' && <OpenMonthCard report={data} />}
      {data && data.status !== 'NOT_OPENED' && (
        // One column on the phone and tablet. On a desktop the rows take the left column and
        // everything about the month stacks on the right: the rows span every row of the grid
        // and the last one (1fr) takes their extra height, so the two sections on the right
        // stay together however long the list is.
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-6">
          <section
            aria-label="El mes"
            className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1"
          >
            <MonthSummary report={data} />
            {data.historical && <PaperCard month={month} />}
            <ReportPdfActions report={data} />
            <PendingGarbage
              report={data}
              onAdjust={
                data.canWrite
                  ? (week) =>
                      setEditing({ kind: 'new', preset: { category: 'GARBAGE', week: week.week } })
                  : undefined
              }
            />
          </section>
          <section
            aria-label="Movimientos"
            className="flex flex-col gap-4 lg:col-start-1 lg:row-span-3 lg:row-start-1"
          >
            {data.canWrite && wide && <div className="flex justify-end">{addButton}</div>}
            <MovementList
              movements={data.movements}
              // The history keeps no accounts: a payment is not described as an adelanto.
              showCoverage={!data.historical}
              onSelect={
                data.canWrite ? (movement) => setEditing({ kind: 'movement', movement }) : undefined
              }
            />
          </section>
          <section
            aria-label="Limpieza y cierre"
            className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2"
          >
            <CleaningCard
              report={data}
              onMarkVisits={data.canWrite ? () => setEditing({ kind: 'visits' }) : undefined}
            />
            <MonthClosingCard report={data} />
            {!data.canWrite && data.status === 'OPEN' && (
              <p className="text-xs/relaxed text-muted-foreground">
                {data.historical
                  ? 'Solo lectura: el superadmin lo captura de su hoja de papel.'
                  : 'Solo lectura: lo anota el depto en turno.'}
              </p>
            )}
            {data.canWrite && month >= thisMonth && (
              <p className="text-xs/relaxed text-muted-foreground">
                Se cierra a partir del 1 de {formatMonthName(addMonths(month, 1))}, ya con todo
                anotado.
              </p>
            )}
            {data.status === 'CLOSED' && !data.canReopen && (
              <p className="text-xs/relaxed text-muted-foreground">
                Mes cerrado: la lista está congelada.
              </p>
            )}
          </section>
        </div>
      )}
      <Button variant="ghost" size="sm" className="self-start" render={<Link to="/history" />}>
        <ListBulletsIcon /> Todos los meses
      </Button>

      {data?.canWrite && !wide && addButton}
      {data && editing?.kind === 'visits' && (
        <CleaningVisitsSheet report={data} onClose={() => setEditing(null)} />
      )}
      {data && editing && editing.kind !== 'visits' && (
        <MovementSheet
          key={editing.kind === 'new' ? 'new' : editing.movement.id}
          report={data}
          movement={editing.kind === 'new' ? null : editing.movement}
          preset={editing.kind === 'new' ? editing.preset : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
