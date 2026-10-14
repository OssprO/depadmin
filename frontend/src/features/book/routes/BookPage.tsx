import type { Movement } from '@depadmin/shared';
import { CaretLeftIcon, CaretRightIcon, PlusIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { addMonths, buildingToday, formatMonth } from '@/lib/format';
import { monthQueryOptions } from '../api';
import { MonthSummary } from '../components/MonthSummary';
import { MovementList } from '../components/MovementList';
import { MovementSheet } from '../components/MovementSheet';
import { OpenMonthCard } from '../components/OpenMonthCard';

/**
 * The month's book: the summary on top and every row below. It is the turn admin's main
 * screen, and read-only for everyone else.
 */
export function BookPage({ month }: { month: string }) {
  const report = useQuery(monthQueryOptions(month));
  const [editing, setEditing] = useState<Movement | 'new' | null>(null);
  const thisMonth = buildingToday().slice(0, 7);
  const data = report.data;

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
        <>
          <MonthSummary report={data} />
          <MovementList
            movements={data.movements}
            onSelect={data.canWrite ? (movement) => setEditing(movement) : undefined}
          />
          {!data.canWrite && data.status === 'OPEN' && (
            <p className="text-xs/relaxed text-muted-foreground">
              Solo lectura: lo anota el depto en turno.
            </p>
          )}
        </>
      )}

      {data?.canWrite && (
        <Button
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] shadow-lg"
          onClick={() => setEditing('new')}
        >
          <PlusIcon /> Agregar
        </Button>
      )}
      {data && editing && (
        <MovementSheet
          key={editing === 'new' ? 'new' : editing.id}
          report={data}
          movement={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
