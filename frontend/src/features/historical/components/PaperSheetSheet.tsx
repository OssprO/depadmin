import {
  type PaperSheet,
  type SheetRequest,
  sheetRequestSchema,
  UNIT_NUMBERS,
} from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/FormError';
import { FormSheetContent } from '@/components/FormSheetContent';
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

interface LineValues {
  ownerName: string;
  current: string;
  other: string;
  text: string;
}

interface FormValues extends Record<Figure, string> {
  fromDay: string;
  source: string;
  responsible: string;
  alerts: string;
  lines: Record<string, LineValues>;
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

const lineSchema = z.object({
  ownerName: z.string().trim(),
  current: figure(false),
  other: figure(false),
  text: z.string().trim(),
});

const formSchema = z
  .object({
    fromDay: z.string().regex(/^\d{1,2}$/, 'Escribe el día, por ejemplo 1 o 10'),
    source: z.string(),
    responsible: z.string().trim(),
    opening: figure(true),
    income: figure(false),
    expense: figure(false),
    closing: figure(true),
    alerts: z.string(),
    lines: z.record(z.string(), lineSchema),
  })
  .transform((form): SheetRequest => ({
    fromDay: Number(form.fromDay),
    source: form.source,
    responsible: form.responsible || null,
    opening: form.opening,
    income: form.income,
    expense: form.expense,
    closing: form.closing,
    alerts: form.alerts
      .split('\n')
      .map((alert) => alert.trim())
      .filter(Boolean),
    lines: UNIT_NUMBERS.flatMap((unit) => {
      const line = form.lines[unit];
      if (!line) return [];
      const { ownerName, current, other, text } = line;
      if (!ownerName && current === null && other === null && !text) return [];
      return [{ unit, ownerName: ownerName || null, current, other, text }];
    }),
  }))
  .pipe(sheetRequestSchema);

function valuesFor(sheet: PaperSheet | null): FormValues {
  const amount = (value: number | null) => (value === null ? '' : pesosInput(value));
  return {
    fromDay: String(sheet?.fromDay ?? 1),
    source: sheet?.source ?? '',
    responsible: sheet?.responsible ?? '',
    opening: amount(sheet?.opening ?? null),
    income: amount(sheet?.income ?? null),
    expense: amount(sheet?.expense ?? null),
    closing: amount(sheet?.closing ?? null),
    alerts: sheet?.alerts.join('\n') ?? '',
    lines: Object.fromEntries(
      UNIT_NUMBERS.map((unit) => {
        const line = sheet?.lines.find((candidate) => candidate.unit === unit);
        return [
          unit,
          {
            ownerName: line?.ownerName ?? '',
            current: amount(line?.current ?? null),
            other: amount(line?.other ?? null),
            text: line?.text ?? '',
          },
        ];
      }),
    ),
  };
}

interface PaperSheetSheetProps {
  readonly month: string;
  /** The sheet to correct, or null to add one found later. */
  readonly sheet: PaperSheet | null;
  readonly onClose: () => void;
}

/** A paper sheet's figures, remarks and line per depto, as the paper says them. */
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
      <FormSheetContent>
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
            <Field data-invalid={!!errors.responsible}>
              <FieldLabel htmlFor="sheet-responsible">Responsable</FieldLabel>
              <Input
                id="sheet-responsible"
                autoComplete="off"
                placeholder="Si la hoja dice quién administró"
                aria-invalid={!!errors.responsible}
                {...form.register('responsible')}
              />
              <FieldError errors={[errors.responsible]} />
            </Field>
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
            {UNIT_NUMBERS.map((unit) => {
              const lineErrors = errors.lines?.[unit];
              return (
                <FieldSet key={unit}>
                  <FieldLegend variant="label">Depto {unit}</FieldLegend>
                  <Field>
                    <FieldLabel htmlFor={`sheet-${unit}-owner`}>Propietario</FieldLabel>
                    <Input
                      id={`sheet-${unit}-owner`}
                      autoComplete="off"
                      placeholder="Como lo escribe la hoja"
                      {...form.register(`lines.${unit}.ownerName`)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field data-invalid={!!lineErrors?.current}>
                      <FieldLabel htmlFor={`sheet-${unit}-current`}>Mes en curso ($)</FieldLabel>
                      <Input
                        id={`sheet-${unit}-current`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={!!lineErrors?.current}
                        {...form.register(`lines.${unit}.current`)}
                      />
                      <FieldError errors={[lineErrors?.current]} />
                    </Field>
                    <Field data-invalid={!!lineErrors?.other}>
                      <FieldLabel htmlFor={`sheet-${unit}-other`}>Adeudos/adelantos ($)</FieldLabel>
                      <Input
                        id={`sheet-${unit}-other`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={!!lineErrors?.other}
                        {...form.register(`lines.${unit}.other`)}
                      />
                      <FieldError errors={[lineErrors?.other]} />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor={`sheet-${unit}-text`}>Observaciones</FieldLabel>
                    <Input
                      id={`sheet-${unit}-text`}
                      autoComplete="off"
                      {...form.register(`lines.${unit}.text`)}
                    />
                  </Field>
                </FieldSet>
              );
            })}
            <FieldDescription>
              Si la hoja no separa el pago, deja vacíos los dos importes: el reporte pone la cuota
              en «Mes en curso» y el resto en «Adeudos/adelantos».
            </FieldDescription>
            <FieldError errors={[errors.lines?.root]} />
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
      </FormSheetContent>
    </Sheet>
  );
}
