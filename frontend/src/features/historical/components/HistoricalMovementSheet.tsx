import {
  CATEGORY_RULES,
  MOVEMENT_CATEGORIES,
  type Movement,
  type MovementCategory,
  type MovementRequest,
  movementCategorySchema,
  movementRequestSchema,
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
import { CATEGORIES } from '@/features/book/labels';
import { errorMessage } from '@/lib/error-messages';
import {
  formatMoney,
  formatMonth,
  formatWeek,
  parsePesos,
  PESOS_PATTERN,
  pesosInput,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  useAddHistoricalMovement,
  useRemoveHistoricalMovement,
  useReviseHistoricalMovement,
} from '../api';
import { weeksAround } from '../labels';

interface FormValues {
  category: MovementCategory;
  date: string;
  amount: string;
  unit: string;
  description: string;
  week: string;
}

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
      week: z.string(),
    })
    .transform((form): MovementRequest => ({
      date: form.date,
      category: form.category,
      amount: parsePesos(form.amount),
      unit: form.unit ? (Number(form.unit) as MovementRequest['unit']) : null,
      description: form.description.trim() || null,
      week: form.week || null,
    }))
    .pipe(movementRequestSchema);
}

interface HistoricalMovementSheetProps {
  readonly month: string;
  /** The row to correct, or null to add new ones. */
  readonly movement: Movement | null;
  readonly onClose: () => void;
}

/** Adds rows to a past month one after another, or corrects one. */
export function HistoricalMovementSheet({
  month,
  movement,
  onClose,
}: HistoricalMovementSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const add = useAddHistoricalMovement();
  const revise = useReviseHistoricalMovement();
  const remove = useRemoveHistoricalMovement();
  const schema = useMemo(() => formSchema(month), [month]);
  const blank = (category: MovementCategory, date = `${month}-01`): FormValues => ({
    category,
    date,
    amount: '',
    unit: '',
    description: '',
    week: '',
  });
  const form = useForm<FormValues, unknown, MovementRequest>({
    resolver: zodResolver(schema),
    defaultValues: movement
      ? {
          category: movement.category,
          date: movement.date,
          amount: pesosInput(movement.amount),
          unit: movement.unit === null ? '' : String(movement.unit),
          description: movement.description ?? '',
          week: movement.week ?? '',
        }
      : blank('UNIT_PAYMENT'),
  });
  const { errors, isSubmitting } = form.formState;
  const category = useWatch({ control: form.control, name: 'category' });
  const rule = CATEGORY_RULES[category];
  const weeks = weeksAround(month);
  if (movement?.week && !weeks.includes(movement.week)) weeks.unshift(movement.week);

  const chooseCategory = (next: MovementCategory) => {
    form.setValue('category', next);
    if (!CATEGORY_RULES[next].unit) form.setValue('unit', '');
    if (!CATEGORY_RULES[next].week) form.setValue('week', '');
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
          form.reset(blank(body.category, body.date));
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
            <SheetDescription>{formatMonth(month)} · historial</SheetDescription>
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
                <FieldLabel htmlFor="historical-unit">Depto</FieldLabel>
                <NativeSelect
                  id="historical-unit"
                  className="w-full"
                  aria-invalid={!!errors.unit}
                  {...form.register('unit')}
                >
                  <NativeSelectOption value="">Selecciona</NativeSelectOption>
                  {UNIT_NUMBERS.map((unit) => (
                    <NativeSelectOption key={unit} value={unit}>
                      Depto {unit}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError errors={[errors.unit]} />
              </Field>
            )}
            {rule.week && (
              <Field data-invalid={!!errors.week}>
                <FieldLabel htmlFor="historical-week">Semana que se paga</FieldLabel>
                <NativeSelect
                  id="historical-week"
                  className="w-full"
                  aria-invalid={!!errors.week}
                  {...form.register('week')}
                >
                  <NativeSelectOption value="">Selecciona</NativeSelectOption>
                  {weeks.map((week) => (
                    <NativeSelectOption key={week} value={week}>
                      {formatWeek(week)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError errors={[errors.week]} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.date}>
                <FieldLabel htmlFor="historical-date">Fecha</FieldLabel>
                <Input
                  id="historical-date"
                  type="date"
                  min={`${month}-01`}
                  max={`${month}-31`}
                  aria-invalid={!!errors.date}
                  {...form.register('date')}
                />
                <FieldError errors={[errors.date]} />
              </Field>
              <Field data-invalid={!!errors.amount}>
                <FieldLabel htmlFor="historical-amount">Importe ($)</FieldLabel>
                <Input
                  id="historical-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={!!errors.amount}
                  {...form.register('amount')}
                />
                <FieldError errors={[errors.amount]} />
              </Field>
            </div>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="historical-description">
                Descripción{rule.description ? '' : ' (opcional)'}
              </FieldLabel>
              <Input
                id="historical-description"
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
