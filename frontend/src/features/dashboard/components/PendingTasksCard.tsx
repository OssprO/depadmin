import { CaretRightIcon, LockKeyIcon, TrashIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { historyQueryOptions, monthQueryOptions } from '@/features/book/api';
import { buildingToday, formatMonth } from '@/lib/format';

/**
 * What the caller should do in the books now: close the months that are over (the outgoing
 * owner in the handover, or the superadmin) and confirm the pending garbage weeks. Nothing
 * shows when there is nothing to do.
 */
export function PendingTasksCard() {
  const thisMonth = buildingToday().slice(0, 7);
  const history = useQuery(historyQueryOptions);
  const current = useQuery(monthQueryOptions(thisMonth));

  const toClose = history.data?.months.filter((entry) => entry.canClose).reverse() ?? [];
  const garbage = current.data?.canWrite
    ? current.data.garbageWeeks.filter((week) => week.status === 'PENDING').length
    : 0;
  if (toClose.length === 0 && garbage === 0) return null;

  return (
    <Card size="sm" role="region" aria-labelledby="pending-tasks">
      <CardHeader>
        <CardTitle>
          <h2 id="pending-tasks">Pendientes</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {toClose.map((entry) => (
            <Task key={entry.month} month={entry.month} icon={<LockKeyIcon />}>
              Cerrar {formatMonth(entry.month)}
            </Task>
          ))}
          {garbage > 0 && (
            <Task month={thisMonth} icon={<TrashIcon />}>
              {garbage === 1
                ? 'Confirmar 1 semana de basura'
                : `Confirmar ${garbage} semanas de basura`}
            </Task>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function Task({ month, icon, children }: { month: string; icon: ReactNode; children: ReactNode }) {
  return (
    <li>
      <Link
        to="/book/$month"
        params={{ month }}
        className="flex items-center gap-3 py-2 [&>svg:first-child]:size-5"
      >
        {icon}
        <span className="flex-1 font-medium">{children}</span>
        <CaretRightIcon className="text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
