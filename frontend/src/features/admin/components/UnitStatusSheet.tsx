import { type SetUnitStatusRequest, setUnitStatusRequestSchema, type Unit } from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError } from '@/components/FormError';
import { FormSheetContent } from '@/components/FormSheetContent';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { errorMessage } from '@/lib/error-messages';
import { dayKey } from '@/lib/format';
import { useSetUnitStatus } from '../api';

/** Inactive from a month on, or active again if it has an open inactive period. */
export function UnitStatusSheet({ unit }: { unit: Unit }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStatus = useSetUnitStatus();
  // Reactivating closes the open inactive period; otherwise a new one starts.
  const reactivate = unit.inactivePeriods.some((period) => period.to === null);
  const defaults: SetUnitStatusRequest = {
    active: reactivate,
    from: dayKey(new Date().toISOString()).slice(0, 7),
  };
  const form = useForm<SetUnitStatusRequest>({
    resolver: zodResolver(setUnitStatusRequestSchema),
    defaultValues: defaults,
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (body) => {
    setError(null);
    try {
      await setStatus.mutateAsync({ unit: unit.number, ...body });
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
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        {reactivate ? 'Reactivar' : 'Marcar inactivo'}
      </SheetTrigger>
      <FormSheetContent>
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <SheetHeader>
            <SheetTitle>
              {reactivate ? `Reactivar Depto ${unit.number}` : `Depto ${unit.number} inactivo`}
            </SheetTitle>
            <SheetDescription>
              {reactivate
                ? 'Vuelve a pagar cuota y a tomar sus turnos desde el mes que elijas.'
                : 'Un depto inactivo no paga cuota. Su turno queda sin responsable hasta que asignes quién lo cubre; el calendario de los demás no cambia.'}
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            <Field data-invalid={!!errors.from}>
              <FieldLabel htmlFor="status-from">Desde</FieldLabel>
              <Input
                id="status-from"
                type="month"
                aria-invalid={!!errors.from}
                {...form.register('from')}
              />
              <FieldDescription>El cambio aplica a meses completos.</FieldDescription>
              <FieldError errors={[errors.from]} />
            </Field>
            <FormError message={error} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </SheetFooter>
        </form>
      </FormSheetContent>
    </Sheet>
  );
}
