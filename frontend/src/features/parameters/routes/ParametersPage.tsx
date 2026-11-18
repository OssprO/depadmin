import type { RatesResponse } from '@depadmin/shared';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatFullDate, formatMoney, formatMonth } from '@/lib/format';
import { ratesQueryOptions } from '../api';
import { RateChangeSheet } from '../components/RateChangeSheet';
import { WithdrawRateChangeDialog } from '../components/WithdrawRateChangeDialog';
import { RATES } from '../labels';

type Rate = RatesResponse['rates'][number];
type Change = Rate['history'][number];

/** "2027-01-01" → "2027-01": rate changes apply from the first of a month. */
const monthOf = (date: string) => date.slice(0, 7);

function Agreement({ change }: { change: Change }) {
  if (!change.agreement) return null;
  return (
    <span className="text-muted-foreground">
      Acordado el {formatFullDate(change.agreement.on)}: {change.agreement.summary}
    </span>
  );
}

function RateCard({ rate, canChange }: { rate: Rate; canChange: boolean }) {
  const { title, unit } = RATES[rate.rate];
  const upcoming = rate.history.filter((change) => change.upcoming);
  const past = rate.history.filter((change) => !change.upcoming).reverse();

  return (
    <Card size="sm" role="region" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{unit}</CardDescription>
        {canChange && (
          <CardAction>
            <RateChangeSheet
              rate={rate.rate}
              current={rate.current}
              earliestMonth={rate.earliestMonth}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="font-heading text-2xl font-bold">
          {rate.current === null ? '—' : formatMoney(rate.current)}
        </p>
        {past[0] && <Agreement change={past[0]} />}
        {upcoming.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Cambios programados">
            {upcoming.map((change) => (
              <li key={change.effectiveFrom} className="flex flex-col gap-0.5 border-l-2 pl-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    Desde {formatMonth(monthOf(change.effectiveFrom))}: {formatMoney(change.amount)}
                  </span>
                  {change.withdrawable && (
                    <WithdrawRateChangeDialog
                      rate={rate.rate}
                      from={monthOf(change.effectiveFrom)}
                      amount={change.amount}
                    />
                  )}
                </span>
                <Agreement change={change} />
              </li>
            ))}
          </ul>
        )}
        {past.length > 1 && (
          <details className="group">
            <summary className="cursor-pointer text-muted-foreground">
              Valores anteriores ({past.length - 1})
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {past.slice(1).map((change) => (
                <li key={change.effectiveFrom} className="flex flex-col gap-0.5">
                  <span>
                    Desde {formatMonth(monthOf(change.effectiveFrom))}: {formatMoney(change.amount)}
                  </span>
                  <Agreement change={change} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * What the building agreed: its rates for now; the voting rules join them in phase 27.
 * Everyone reads it; the shift administrator records the changes (ADR-0031).
 */
export function ParametersPage() {
  const rates = useQuery(ratesQueryOptions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Parámetros</h1>
      <p className="text-muted-foreground">
        Las tarifas las acuerda la asamblea. Quien lleva la administración del mes registra lo
        acordado, y aplica desde un mes que todavía no se abre.
      </p>
      <h2 className="font-heading font-bold">Tarifas</h2>
      {rates.isPending && <p className="text-muted-foreground">Cargando…</p>}
      {rates.isError && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground">No se pudieron cargar las tarifas.</p>
          <Button variant="outline" size="sm" onClick={() => void rates.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {rates.isSuccess && (
        <div className="grid gap-4 md:grid-cols-2">
          {rates.data.rates.map((rate) => (
            <RateCard key={rate.rate} rate={rate} canChange={rates.data.canChange} />
          ))}
        </div>
      )}
    </div>
  );
}
