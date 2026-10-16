import type { Movement } from '@depadmin/shared';
import { ArrowDownLeftIcon, ArrowUpRightIcon, BroomIcon, TrashIcon } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatLocalDate, formatMoney, formatWeek } from '@/lib/format';
import { cn } from '@/lib/utils';
import { describeCoverage, isIncome, movementTitle } from '../labels';

const ICONS = {
  UNIT_PAYMENT: ArrowDownLeftIcon,
  OTHER_INCOME: ArrowDownLeftIcon,
  GARBAGE: TrashIcon,
  CLEANING: BroomIcon,
  OTHER_EXPENSE: ArrowUpRightIcon,
} as const;

function byDay(movements: readonly Movement[]) {
  const days: { date: string; movements: Movement[] }[] = [];
  for (const movement of movements) {
    const last = days.at(-1);
    if (last?.date === movement.date) last.movements.push(movement);
    else days.push({ date: movement.date, movements: [movement] });
  }
  return days;
}

interface MovementListProps {
  readonly movements: readonly Movement[];
  /** Set when the rows can be edited: tapping one opens it. */
  readonly onSelect?: ((movement: Movement) => void) | undefined;
  /** What each payment covered. Off for the history, which keeps no accounts. */
  readonly showCoverage?: boolean;
}

/** The month's rows, grouped by day, as the report will list them. */
export function MovementList({ movements, onSelect, showCoverage = true }: MovementListProps) {
  if (movements.length === 0) {
    return <p className="text-xs/relaxed text-muted-foreground">Sin movimientos todavía.</p>;
  }
  return byDay(movements).map((day) => (
    <Card key={day.date} size="sm">
      <CardHeader>
        <CardTitle>
          <h2 className="first-letter:uppercase">{formatLocalDate(day.date)}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {day.movements.map((movement) => {
            const Icon = ICONS[movement.category];
            const income = isIncome(movement.category);
            const detail =
              (showCoverage ? describeCoverage(movement) : null) ??
              (movement.week && `semana ${formatWeek(movement.week)}`);
            // A payment's observations, which the report prints for its depto.
            const notes = movement.category === 'UNIT_PAYMENT' ? movement.description : null;
            const content = (
              <>
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex flex-1 flex-col text-left">
                  <span className="font-medium">{movementTitle(movement)}</span>
                  {detail && <span className="text-muted-foreground">{detail}</span>}
                  {notes && <span className="text-muted-foreground italic">{notes}</span>}
                </span>
                <span className={cn('tabular-nums', income && 'font-medium')}>
                  {income ? '+' : '−'} {formatMoney(movement.amount)}
                </span>
              </>
            );
            return (
              <li
                key={movement.id}
                // Money in or out at a glance: an accent on the right edge, the text unchanged.
                data-direction={income ? 'in' : 'out'}
                className={cn('border-r-4 pr-2', income ? 'border-r-income' : 'border-r-expense')}
              >
                {onSelect ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 py-2.5"
                    onClick={() => onSelect(movement)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  ));
}
