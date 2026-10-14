import type { MonthlyReport } from '@depadmin/shared';
import { CalendarCheckIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatMoney, formatShortDate, formatWeek } from '@/lib/format';

interface CleaningCardProps {
  readonly report: MonthlyReport;
  /** Set when the month can be written: opens the calendar to mark visits. */
  readonly onMarkVisits?: (() => void) | undefined;
}

/**
 * What to pay the cleaning person each week. A week that crosses into the next or previous
 * month shows all its visits, though each one counts in the month of its date.
 */
export function CleaningCard({ report, onMarkVisits }: CleaningCardProps) {
  const payouts = report.cleaningPayouts;
  if (payouts.length === 0 && !onMarkVisits) return null;

  return (
    <Card size="sm" role="region" aria-labelledby="cleaning-weeks">
      <CardHeader>
        <CardTitle>
          <h2 id="cleaning-weeks">Limpieza por semana</h2>
        </CardTitle>
        <CardDescription>Lo que se le paga cada semana.</CardDescription>
        {onMarkVisits && (
          <CardAction>
            <Button size="sm" variant="outline" onClick={onMarkVisits}>
              <CalendarCheckIcon /> Marcar visitas
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {payouts.length === 0 ? (
          <p className="text-muted-foreground">Sin visitas este mes.</p>
        ) : (
          <ul className="divide-y">
            {payouts.map((payout) => (
              <li key={payout.weekStart} className="flex items-center gap-3 py-2">
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">Semana {formatWeek(payout.weekStart)}</span>
                  <span className="text-muted-foreground">
                    {payout.dates.length === 1 ? '1 visita' : `${payout.dates.length} visitas`}:{' '}
                    {payout.dates.map(formatShortDate).join(', ')}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatMoney(payout.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
