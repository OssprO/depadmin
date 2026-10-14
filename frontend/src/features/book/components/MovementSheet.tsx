import {
  CATEGORY_RULES,
  MOVEMENT_CATEGORIES,
  type Movement,
  type MovementCategory,
  type MovementRequest,
  movementCategorySchema,
  movementRequestSchema,
  type MonthlyReport,
  UNIT_NUMBERS,
} from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
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
  buildingToday,
  formatMoney,
  formatMonth,
  parsePesos,
  PESOS_PATTERN,
  pesosInput,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAddMovement, useRemoveMovement, useReviseMovement } from '../api';
import { CATEGORIES } from '../labels';

interface FormValues {
  category: MovementCategory;
  date: string;
  amount: string;
  unit: string;
  description: string;
}

/** The form's strings, checked and turned into the API's row (which applies the category rules). */
function formSchema(month: string) {
  return z
    .object({
      category: movementCategorySchema,
      date: z.string().refine((date) => date.startsWith(`${month}-`), {
        message: `La fecha debe ser de ${formatMonth(month)}`,
      }),
      amount: z
        .string()
        .trim()
        .regex(PESOS_PATTERN, 'Escribe un importe, por ejemplo 700 o 150.50'),
      unit: z.string(),
      description: z.string(),
    })
    .transform((form): MovementRequest => ({
      date: form.date,
      category: form.category,
      amount: parsePesos(form.amount),
      unit: form.unit ? (Number(form.unit) as MovementRequest['unit']) : null,
      description: form.description.trim() || null,
    }))
    .pipe(movementRequestSchema);
}

function suggestion(category: MovementCategory, report: MonthlyReport): string {
  const rates = report.suggestions;
  if (!rates) return '';
  const amounts: Partial<Record<MovementCategory, number>> = {
    UNIT_PAYMENT: rates.maintenanceFee,
    CLEANING: rates.cleaningPerVisit,
    GARBAGE: rates.garbageWeekly,
  };
  const amount = amounts[category];
  return amount === undefined ? '' : pesosInput(amount);
}

function valuesFor(
  report: MonthlyReport,
  movement: Movement | null,
  category: MovementCategory,
): FormValues {
  if (movement) {
    return {
      category: movement.category,
      date: movement.date,
      amount: pesosInput(movement.amount),
      unit: movement.unit === null ? '' : String(movement.unit),
      description: movement.description ?? '',
    };
  }
  const today = buildingToday();
  return {
    category,
    date: today.startsWith(`${report.month}-`) ? today : `${report.month}-01`,
    amount: suggestion(category, report),
    unit: '',
    description: '',
  };
}

interface MovementSheetProps {
  readonly report: MonthlyReport;
  /** The row to edit, or null to add new ones. */
  readonly movement: Movement | null;
  readonly onClose: () => void;
}

/**
 * Adds rows one after another, or edits one. The fields follow the type: a depto for a
 * payment (those that owe first), a description for "other" rows, and the amount in force
 * prefilled. It is mounted while open, so each opening starts from fresh values.
 */
export function MovementSheet({ report, movement, onClose }: MovementSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const add = useAddMovement();
  const revise = useReviseMovement();
  const remove = useRemoveMovement();
  const schema = useMemo(() => formSchema(report.month), [report.month]);
  const form = useForm<FormValues, unknown, MovementRequest>({
    resolver: zodResolver(schema),
    defaultValues: valuesFor(report, movement, 'UNIT_PAYMENT'),
  });
  const { errors, isSubmitting } = form.formState;
  const category = useWatch({ control: form.control, name: 'category' });
  const rule = CATEGORY_RULES[category];

  // Those that owe go first, with what they owe, so the usual payment is one tap away.
  const units = [...UNIT_NUMBERS]
    .map((unit) => ({
      unit,
      owes: report.accounts.find((account) => account.unit === unit)?.outstanding ?? 0,
    }))
    .sort((a, b) => b.owes - a.owes || a.unit - b.unit);

  const chooseCategory = (next: MovementCategory) => {
    form.setValue('category', next);
    if (!movement) form.setValue('amount', suggestion(next, report));
    if (!CATEGORY_RULES[next].unit) form.setValue('unit', '');
  };

  const submit = (keepAdding: boolean) =>
    form.handleSubmit(async (body) => {
      setError(null);
      setSaved(null);
      try {
        if (movement) {
          await revise.mutateAsync({ id: movement.id, body });
        } else {
          await add.mutateAsync(body);
        }
        if (keepAdding) {
          setSaved(`Guardado: ${CATEGORIES[body.category]} por ${formatMoney(body.amount)}.`);
          form.reset({ ...valuesFor(report, null, body.category), date: body.date });
        } else {
          onClose();
        }
      } catch (failure) {
        setError(errorMessage(failure));
      }
    });

  const removeMovement = async () => {
    if (!movement) return;
    setError(null);
    try {
      await remove.mutateAsync(movement.id);
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
        <form onSubmit={(event) => void submit(false)(event)} noValidate>
          <SheetHeader>
            <SheetTitle>{movement ? 'Corregir movimiento' : 'Agregar movimiento'}</SheetTitle>
            <SheetDescription>{formatMonth(report.month)}</SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            <FieldSet>
              <FieldLegend variant="label">Tipo</FieldLegend>
              <div className="flex flex-wrap gap-2">
                {MOVEMENT_CATEGORIES.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'relative cursor-pointer border px-3 py-2 has-focus-visible:ring-2 has-focus-visible:ring-ring',
                      option === category
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input',
                    )}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={option}
                      checked={option === category}
                      onChange={() => chooseCategory(option)}
                      className="sr-only"
                    />
                    {CATEGORIES[option]}
                  </label>
                ))}
              </div>
            </FieldSet>
            {rule.unit && (
              <Field data-invalid={!!errors.unit}>
                <FieldLabel htmlFor="movement-unit">Depto</FieldLabel>
                <NativeSelect
                  id="movement-unit"
                  className="w-full"
                  aria-invalid={!!errors.unit}
                  {...form.register('unit')}
                >
                  <NativeSelectOption value="">Selecciona</NativeSelectOption>
                  {units.map(({ unit, owes }) => (
                    <NativeSelectOption key={unit} value={unit}>
                      Depto {unit}
                      {owes > 0 ? ` · debe ${formatMoney(owes)}` : ''}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError errors={[errors.unit]} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.date}>
                <FieldLabel htmlFor="movement-date">Fecha</FieldLabel>
                <Input
                  id="movement-date"
                  type="date"
                  min={`${report.month}-01`}
                  max={`${report.month}-31`}
                  aria-invalid={!!errors.date}
                  {...form.register('date')}
                />
                <FieldError errors={[errors.date]} />
              </Field>
              <Field data-invalid={!!errors.amount}>
                <FieldLabel htmlFor="movement-amount">Importe ($)</FieldLabel>
                <Input
                  id="movement-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={!!errors.amount}
                  {...form.register('amount')}
                />
                <FieldError errors={[errors.amount]} />
              </Field>
            </div>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="movement-description">
                Descripción{rule.description ? '' : ' (opcional)'}
              </FieldLabel>
              <Input
                id="movement-description"
                autoComplete="off"
                aria-invalid={!!errors.description}
                {...form.register('description')}
              />
              <FieldError errors={[errors.description]} />
            </Field>
            <FormError message={error} />
            {saved && (
              <p role="status" className="text-muted-foreground">
                {saved}
              </p>
            )}
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              {movement ? 'Guardar cambios' : 'Guardar'}
            </Button>
            {!movement && (
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={(event) => void submit(true)(event)}
              >
                Guardar y agregar otro
              </Button>
            )}
            {movement &&
              (confirmingRemoval ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => void removeMovement()}
                >
                  Sí, borrar este movimiento
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setConfirmingRemoval(true)}>
                  Borrar
                </Button>
              ))}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
