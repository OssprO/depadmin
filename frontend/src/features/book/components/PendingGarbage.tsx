import type { GarbageWeek, MonthlyReport } from '@depadmin/shared';
import { TrashIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages';
import { formatMoney, formatShortDate, formatWeek } from '@/lib/format';
import { useAddMovement } from '../api';

interface PendingGarbageProps {
  readonly report: MonthlyReport;
  /** Set when the month can be written: opens the form to adjust the date first. */
  readonly onAdjust?: ((week: GarbageWeek) => void) | undefined;
}

/**
 * The weeks of garbage that have begun and are not recorded yet. They are suggestions, not
 * rows: they count nowhere until confirmed, which records the real row in one tap.
 */
export function PendingGarbage({ report, onAdjust }: PendingGarbageProps) {
  const add = useAddMovement();
  const [error, setError] = useState<string | null>(null);
  const pending = report.garbageWeeks.filter((week) => week.status === 'PENDING');
  const amount = report.suggestions?.garbageWeekly;
  if (report.status !== 'OPEN' || pending.length === 0) return null;

  const confirm = async (week: GarbageWeek) => {
    if (amount === undefined) return;
    setError(null);
    try {
      await add.mutateAsync({
        date: week.suggestedDate,
        category: 'GARBAGE',
        amount,
        unit: null,
        description: null,
        week: week.week,
      });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <Card size="sm" role="region" aria-labelledby="pending-garbage">
      <CardHeader>
        <CardTitle>
          <h2 id="pending-garbage">Basura por confirmar</h2>
        </CardTitle>
        <CardDescription>No cuenta en los totales hasta que se confirma.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {pending.map((week) => {
            const label = `Semana ${formatWeek(week.week)}`;
            const content = (
              <>
                <TrashIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex flex-1 flex-col text-left">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground">
                    {amount === undefined ? 'Se paga' : formatMoney(amount)} el{' '}
                    {formatShortDate(week.suggestedDate)}
                  </span>
                </span>
              </>
            );
            return (
              <li key={week.week} className="flex items-center gap-3 py-2">
                {onAdjust ? (
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-3"
                    aria-label={`${label}: ajustar antes de confirmar`}
                    onClick={() => onAdjust(week)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex flex-1 items-center gap-3">{content}</div>
                )}
                {onAdjust && amount !== undefined && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Confirmar ${label.toLowerCase()}`}
                    disabled={add.isPending}
                    onClick={() => void confirm(week)}
                  >
                    Confirmar
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
