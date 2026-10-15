import {
  type HistoricalSheet,
  type SheetRequest,
  sheetRequestSchema,
  UNIT_NUMBERS,
} from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import {
  formatMonth,
  parsePesos,
  parseSignedPesos,
  PESOS_PATTERN,
  pesosInput,
  SIGNED_PESOS_PATTERN,
} from '@/lib/format';
import { useAddSheet, useRemoveSheet, useReviseSheet } from '../api';

const FIGURES = [
  { name: 'opening', label: 'Saldo inicial', signed: true },
  { name: 'income', label: 'Ingresos', signed: false },
  { name: 'expense', label: 'Egresos', signed: false },
  { name: 'closing', label: 'Saldo final', signed: true },
] as const;

type Figure = (typeof FIGURES)[number]['name'];

interface FormValues extends Record<Figure, string> {
  fromDay: string;
  source: string;
  alerts: string;
  notes: Record<string, string>;
}

/** An empty field means the paper does not say (or it cannot be read). */
const figure = (signed: boolean) =>
  z
    .string()
    .trim()
    .refine((text) => text === '' || (signed ? SIGNED_PESOS_PATTERN : PESOS_PATTERN).test(text), {
      message: signed ? 'Por ejemplo 712.25 o -1506.81' : 'Por ejemplo 4800 o 150.50',
    })
    .transform((text) => {
      if (text === '') return null;
      return signed ? parseSignedPesos(text) : parsePesos(text);
    });

const formSchema = z
  .object({
    fromDay: z.string().regex(/^\d{1,2}$/, 'Escribe el día, por ejemplo 1 o 10'),
    source: z.string(),
    opening: figure(true),
    income: figure(false),
    expense: figure(false),
    closing: figure(true),
    alerts: z.string(),
    notes: z.record(z.string(), z.string()),
  })
  .transform((form): SheetRequest => ({
    fromDay: Number(form.fromDay),
    source: form.source,
    opening: form.opening,
    income: form.income,
    expense: form.expense,
    closing: form.closing,
    alerts: form.alerts
      .split('\n')
      .map((alert) => alert.trim())
      .filter(Boolean),
    notes: UNIT_NUMBERS.map((unit) => ({ unit, text: form.notes[unit]?.trim() ?? '' })).filter(
      (note) => note.text !== '',
    ),
  }))
  .pipe(sheetRequestSchema);

function valuesFor(sheet: HistoricalSheet | null): FormValues {
  const amount = (value: number | null) => (value === null ? '' : pesosInput(value));
  return {
    fromDay: String(sheet?.fromDay ?? 1),
    source: sheet?.source ?? '',
    opening: amount(sheet?.opening ?? null),
    income: amount(sheet?.income ?? null),
    expense: amount(sheet?.expense ?? null),
    closing: amount(sheet?.closing ?? null),
    alerts: sheet?.alerts.join('\n') ?? '',
    notes: Object.fromEntries(
      UNIT_NUMBERS.map((unit) => [
        unit,
        sheet?.notes.find((note) => note.unit === unit)?.text ?? '',
      ]),
    ),
  };
}

interface PaperSheetSheetProps {
  readonly month: string;
  /** The sheet to correct, or null to add one found later. */
  readonly sheet: HistoricalSheet | null;
  readonly onClose: () => void;
}

/** A paper sheet's figures, remarks and observations per depto, as the paper says them. */
export function PaperSheetSheet({ month, sheet, onClose }: PaperSheetSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const add = useAddSheet();
  const revise = useReviseSheet();
  const remove = useRemoveSheet();
  const form = useForm<FormValues, unknown, SheetRequest>({
    resolver: zodResolver(formSchema),
    defaultValues: valuesFor(sheet),
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (body) => {
    setError(null);
    try {
      if (sheet) await revise.mutateAsync({ id: sheet.id, body });
      else await add.mutateAsync({ ...body, month });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  });

  const removeSheet = async () => {
    if (!sheet) return;
    setError(null);
    try {
      await remove.mutateAsync(sheet.id);
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
        <form onSubmit={(event) => void submit(event)} noValidate>
          <SheetHeader>
            <SheetTitle>{sheet ? 'Corregir hoja' : 'Agregar hoja'}</SheetTitle>
            <SheetDescription>
              {formatMonth(month)}. Escribe las cifras como dice el papel; deja vacío lo que no dice
              o no se lee.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <Field data-invalid={!!errors.fromDay}>
                <FieldLabel htmlFor="sheet-from-day">Desde el día</FieldLabel>
                <Input
                  id="sheet-from-day"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={!!errors.fromDay}
                  {...form.register('fromDay')}
                />
                <FieldError errors={[errors.fromDay]} />
              </Field>
              <Field data-invalid={!!errors.source}>
                <FieldLabel htmlFor="sheet-source">De dónde sale</FieldLabel>
                <Input
                  id="sheet-source"
                  autoComplete="off"
                  placeholder="PDF, página o foto"
                  aria-invalid={!!errors.source}
                  {...form.register('source')}
                />
                <FieldError errors={[errors.source]} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {FIGURES.map(({ name, label }) => (
                <Field key={name} data-invalid={!!errors[name]}>
                  <FieldLabel htmlFor={`sheet-${name}`}>{label} ($)</FieldLabel>
                  <Input
                    id={`sheet-${name}`}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={!!errors[name]}
                    {...form.register(name)}
                  />
                  <FieldError errors={[errors[name]]} />
                </Field>
              ))}
            </div>
            <Field data-invalid={!!errors.alerts}>
              <FieldLabel htmlFor="sheet-alerts">Alertas</FieldLabel>
              <Textarea id="sheet-alerts" rows={3} {...form.register('alerts')} />
              <FieldDescription>Una por renglón: lo que no cuadra o falta.</FieldDescription>
              <FieldError errors={[errors.alerts]} />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Observaciones por depto</FieldLegend>
              {UNIT_NUMBERS.map((unit) => (
                <Field key={unit} orientation="horizontal">
                  <FieldLabel htmlFor={`sheet-note-${unit}`} className="w-12 shrink-0">
                    {unit}
                  </FieldLabel>
                  <Input
                    id={`sheet-note-${unit}`}
                    autoComplete="off"
                    {...form.register(`notes.${unit}`)}
                  />
                </Field>
              ))}
              <FieldError errors={[errors.notes]} />
            </FieldSet>
            <FormError message={error} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              {sheet ? 'Guardar cambios' : 'Agregar hoja'}
            </Button>
            {sheet &&
              (confirmingRemoval ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => void removeSheet()}
                >
                  Sí, borrar la hoja (los movimientos se quedan)
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setConfirmingRemoval(true)}>
                  Borrar hoja
                </Button>
              ))}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
