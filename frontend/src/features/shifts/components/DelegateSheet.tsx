import {
  type CreateDelegationRequest,
  createDelegationRequestSchema,
  type ShiftMonth,
  UNIT_NUMBERS,
} from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { errorMessage } from '@/lib/error-messages';
import { formatMonth, formatMonthRange } from '@/lib/format';
import { useDelegateShift } from '../api';
import { REASONS } from '../labels';

interface DelegateSheetProps {
  /** The months of one scheduled period that can be delegated now. */
  readonly months: readonly ShiftMonth[];
  /**
   * `handover`: the outgoing owner records that the next depto skips its shift.
   * `admin`: the superadmin delegates any of the months, for any reason.
   */
  readonly mode: 'handover' | 'admin';
}

export function DelegateSheet({ months, mode }: DelegateSheetProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const delegate = useDelegateShift();
  const first = months[0]!;
  const last = months.at(-1)!;
  const scheduled = first.scheduledUnit;
  const defaults: CreateDelegationRequest = {
    from: first.month,
    to: last.month,
    delegateUnit: NaN as CreateDelegationRequest['delegateUnit'],
    reason: first.scheduledUnitActive ? 'SKIPPED_SHIFT' : 'INACTIVE_UNIT',
  };
  const form = useForm<CreateDelegationRequest>({
    resolver: zodResolver(createDelegationRequestSchema),
    defaultValues: defaults,
  });
  const { errors, isSubmitting } = form.formState;
  const handover = mode === 'handover';

  const onSubmit = form.handleSubmit(async (body) => {
    setError(null);
    try {
      await delegate.mutateAsync(body);
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          form.reset(defaults);
          setError(null);
        }
      }}
    >
      <SheetTrigger render={<Button size="sm" variant={handover ? 'default' : 'outline'} />}>
        {handover ? 'Registrar entrega' : 'Delegar'}
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-w-md">
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <SheetHeader>
            <SheetTitle>
              {handover ? 'El turno no lo toma el siguiente' : 'Delegar el turno'}
            </SheetTitle>
            <SheetDescription>
              {handover
                ? `Registra quién cubre a Depto ${scheduled} en ${formatMonthRange(first.period.start, first.period.end)}. Depto ${scheduled} paga la multa por cada mes que no toma.`
                : `Turno de Depto ${scheduled}, ${formatMonthRange(first.period.start, first.period.end)}.`}
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            {handover ? (
              <Field>
                <FieldLabel htmlFor="delegation-to">Meses que no toma</FieldLabel>
                <NativeSelect id="delegation-to" className="w-full" {...form.register('to')}>
                  {months.map(({ month }) => (
                    <NativeSelectOption key={month} value={month}>
                      {month === first.month
                        ? `Solo ${formatMonth(month)}`
                        : formatMonthRange(first.month, month)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(['from', 'to'] as const).map((name) => (
                  <Field key={name} data-invalid={!!errors[name]}>
                    <FieldLabel htmlFor={`delegation-${name}`}>
                      {name === 'from' ? 'Desde' : 'Hasta'}
                    </FieldLabel>
                    <NativeSelect
                      id={`delegation-${name}`}
                      className="w-full"
                      aria-invalid={!!errors[name]}
                      {...form.register(name)}
                    >
                      {months.map(({ month }) => (
                        <NativeSelectOption key={month} value={month}>
                          {formatMonth(month)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError errors={[errors[name]]} />
                  </Field>
                ))}
              </div>
            )}
            <Field data-invalid={!!errors.delegateUnit}>
              <FieldLabel htmlFor="delegation-unit">Quién lo cubre</FieldLabel>
              <NativeSelect
                id="delegation-unit"
                className="w-full"
                aria-invalid={!!errors.delegateUnit}
                {...form.register('delegateUnit', { valueAsNumber: true })}
              >
                <NativeSelectOption value="">Selecciona</NativeSelectOption>
                {UNIT_NUMBERS.filter((unit) => unit !== scheduled).map((unit) => (
                  <NativeSelectOption key={unit} value={unit}>
                    Depto {unit}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={[errors.delegateUnit]} />
            </Field>
            {!handover && (
              <Field>
                <FieldLabel htmlFor="delegation-reason">Motivo</FieldLabel>
                <NativeSelect
                  id="delegation-reason"
                  className="w-full"
                  {...form.register('reason')}
                >
                  {Object.entries(REASONS).map(([reason, label]) => (
                    <NativeSelectOption key={reason} value={reason}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  Solo «No toma el turno» genera multa; un depto inactivo no la paga.
                </FieldDescription>
              </Field>
            )}
            <FormError message={error} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
