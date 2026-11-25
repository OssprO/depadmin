import type { MonthlyReport } from '@depadmin/shared';
import { CaretRightIcon, LockKeyIcon, TrashIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { historyQueryOptions, monthQueryOptions } from '@/features/book/api';
import { addMonths, buildingToday, formatMonth } from '@/lib/format';

/** The weeks of a month the caller should confirm: none unless they can write it. */
function pendingGarbage(report: MonthlyReport | undefined): number {
  if (!report?.canWrite) return 0;
  return report.garbageWeeks.filter((week) => week.status === 'PENDING').length;
}

function confirmGarbage(weeks: number): string {
  return weeks === 1 ? 'Confirmar 1 semana de basura' : `Confirmar ${weeks} semanas de basura`;
}

/**
 * What the caller should do in the books now: close the months that are over (the outgoing
 * owner in the handover, or the superadmin) and confirm the pending garbage weeks, of this
 * month and of the one before while it is open. Nothing shows when there is nothing to do.
 */
export function PendingTasksCard() {
  const thisMonth = buildingToday().slice(0, 7);
  const lastMonth = addMonths(thisMonth, -1);
  const history = useQuery(historyQueryOptions);
  const current = useQuery(monthQueryOptions(thisMonth));
  // A week is asked for from the Sunday after its Saturday (phase 36), so when the month ends
  // on a Saturday its last week shows up on the 1st, in the month before.
  const lastMonthOpen =
    history.data?.months.some((entry) => entry.month === lastMonth && entry.status === 'OPEN') ??
    false;
  const previous = useQuery({ ...monthQueryOptions(lastMonth), enabled: lastMonthOpen });

  const toClose = history.data?.months.filter((entry) => entry.canClose).reverse() ?? [];
  const earlierGarbage = lastMonthOpen ? pendingGarbage(previous.data) : 0;
  const garbage = pendingGarbage(current.data);
  if (toClose.length === 0 && earlierGarbage === 0 && garbage === 0) return null;

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
          {earlierGarbage > 0 && (
            <Task month={lastMonth} icon={<TrashIcon />}>
              {confirmGarbage(earlierGarbage)} de {formatMonth(lastMonth)}
            </Task>
          )}
          {garbage > 0 && (
            <Task month={thisMonth} icon={<TrashIcon />}>
              {confirmGarbage(garbage)}
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
