import type { ShiftMonth } from '@depadmin/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { addMonths } from '@/lib/format';
import { useCurrentUser } from '@/lib/use-session';
import { currentShiftQueryOptions, shiftCalendarQueryOptions } from '../api';
import { PeriodCard } from '../components/PeriodCard';

/** Months shown ahead of the current period, and how many more each "earlier" step adds. */
const MONTHS_AHEAD = 12;
const STEP_BACK = 12;

function byPeriod(months: readonly ShiftMonth[]): ShiftMonth[][] {
  const periods: ShiftMonth[][] = [];
  for (const month of months) {
    const last = periods.at(-1);
    if (last?.[0]?.period.start === month.period.start) last.push(month);
    else periods.push([month]);
  }
  return periods;
}

export function ShiftsPage() {
  const user = useCurrentUser();
  const current = useQuery(currentShiftQueryOptions);
  const [monthsBack, setMonthsBack] = useState(0);
  const start = current.data?.current.period.start;
  const calendar = useQuery({
    ...shiftCalendarQueryOptions(
      addMonths(start ?? '2000-01', -monthsBack),
      addMonths(start ?? '2000-01', MONTHS_AHEAD - 1),
    ),
    enabled: start !== undefined,
  });
  const failed = current.isError || calendar.isError;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-lg font-bold">Turnos</h1>
        <p className="text-xs/relaxed text-muted-foreground">
          Cada depto administra dos meses, en orden: 501, 502, 401, 402, 301, 302, 201, 202, 101 y
          102.
        </p>
      </div>
      {failed && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs/relaxed text-muted-foreground">No se pudo cargar el calendario.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void Promise.all([current.refetch(), calendar.refetch()])}
          >
            Reintentar
          </Button>
        </div>
      )}
      {!failed && !calendar.data && (
        <p className="text-xs/relaxed text-muted-foreground">Cargando…</p>
      )}
      {calendar.data && (
        <>
          {monthsBack < 36 && (
            <Button variant="outline" onClick={() => setMonthsBack((back) => back + STEP_BACK)}>
              Ver turnos anteriores
            </Button>
          )}
          {byPeriod(calendar.data).map((months) => (
            <PeriodCard
              key={months[0]!.period.start}
              months={months}
              user={user}
              isCurrent={months[0]!.period.start === start}
            />
          ))}
        </>
      )}
    </div>
  );
}
