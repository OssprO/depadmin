import { cleaningVisitsRequestSchema, type MonthlyReport } from '@depadmin/shared';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { errorMessage } from '@/lib/error-messages';
import {
  addDays,
  buildingToday,
  dayOfWeek,
  formatLocalDate,
  formatMoney,
  formatMonth,
  parsePesos,
  pesosInput,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { useRecordCleaningVisits } from '../api';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Every date of the month, with blanks before the 1st so the grid starts on Monday. */
function monthGrid(month: string): (string | null)[] {
  const first = `${month}-01`;
  const days: (string | null)[] = Array<null>(dayOfWeek(first) - 1).fill(null);
  for (let date = first; date.startsWith(month); date = addDays(date, 1)) days.push(date);
  return days;
}

interface CleaningVisitsSheetProps {
  readonly report: MonthlyReport;
  readonly onClose: () => void;
}

/**
 * The cleaning shortcut: tap the days the person came and record one row per visit, at the
 * rate in force. Days already recorded are marked and cannot be picked twice; days still to
 * come cannot be picked either.
 */
export function CleaningVisitsSheet({ report, onClose }: CleaningVisitsSheetProps) {
  const record = useRecordCleaningVisits();
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState(
    report.suggestions ? pesosInput(report.suggestions.cleaningPerVisit) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const today = buildingToday();
  const recorded = new Set(
    report.movements.filter((row) => row.category === 'CLEANING').map((row) => row.date),
  );
  const perVisit = parsePesos(amount);

  const toggle = (date: string) =>
    setSelected((dates) =>
      dates.includes(date) ? dates.filter((d) => d !== date) : [...dates, date].sort(),
    );

  const submit = async () => {
    setError(null);
    const body = cleaningVisitsRequestSchema.safeParse({ dates: selected, amount: perVisit });
    if (!body.success) {
      setInvalid(body.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    setInvalid(null);
    try {
      await record.mutateAsync(body.data);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Marcar visitas de limpieza</SheetTitle>
          <SheetDescription>{formatMonth(report.month)}: una fila por visita.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <FieldSet>
            <FieldLegend variant="label">Días que vino</FieldLegend>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((day, index) => (
                <span key={index} className="text-muted-foreground" aria-hidden>
                  {day}
                </span>
              ))}
              {monthGrid(report.month).map((date, index) => {
                if (!date) return <span key={`blank-${index}`} />;
                const done = recorded.has(date);
                const picked = selected.includes(date);
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={picked || done}
                    aria-label={`${formatLocalDate(date)}${done ? ', ya registrada' : ''}`}
                    disabled={done || date > today}
                    onClick={() => toggle(date)}
                    className={cn(
                      'aspect-square border tabular-nums disabled:cursor-not-allowed',
                      picked && 'border-primary bg-primary text-primary-foreground',
                      done && 'border-transparent bg-muted text-muted-foreground line-through',
                      !picked && !done && 'border-input disabled:opacity-40',
                    )}
                  >
                    {Number(date.slice(8, 10))}
                  </button>
                );
              })}
            </div>
          </FieldSet>
          <Field data-invalid={Number.isNaN(perVisit)}>
            <FieldLabel htmlFor="visit-amount">Importe por visita ($)</FieldLabel>
            <Input
              id="visit-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              aria-invalid={Number.isNaN(perVisit)}
              onChange={(event) => setAmount(event.target.value)}
            />
            {Number.isNaN(perVisit) && (
              <FieldError>Escribe un importe, por ejemplo 270 o 270.50</FieldError>
            )}
          </Field>
          {invalid && <FieldError>{invalid}</FieldError>}
          <FormError message={error} />
        </div>
        <SheetFooter>
          <Button
            disabled={record.isPending || Number.isNaN(perVisit)}
            onClick={() => void submit()}
          >
            {selected.length === 0 || Number.isNaN(perVisit)
              ? 'Registrar visitas'
              : `Registrar ${selected.length === 1 ? '1 visita' : `${selected.length} visitas`} · ${formatMoney(selected.length * perVisit)}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
