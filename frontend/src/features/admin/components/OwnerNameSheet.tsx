import { ownerNameSchema, type Unit } from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { PencilSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { useRenameOwner } from '../api';

const ownerForm = z.object({ ownerName: ownerNameSchema });

/** The owner's name as the monthly report shows it. Blank clears it. */
export function OwnerNameSheet({ unit }: { unit: Unit }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rename = useRenameOwner();
  const form = useForm<z.infer<typeof ownerForm>>({
    resolver: zodResolver(ownerForm),
    defaultValues: { ownerName: unit.ownerName ?? '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ ownerName }) => {
    setError(null);
    try {
      await rename.mutateAsync({ unit: unit.number, ownerName: ownerName || null });
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
          form.reset({ ownerName: unit.ownerName ?? '' });
          setError(null);
        }
      }}
    >
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Propietario del Depto ${unit.number}`}
          />
        }
      >
        <PencilSimpleIcon />
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-w-md">
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <SheetHeader>
            <SheetTitle>Propietario del Depto {unit.number}</SheetTitle>
            <SheetDescription>
              Aparece en el reporte mensual, en la tabla de ingresos.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            <Field data-invalid={!!errors.ownerName}>
              <FieldLabel htmlFor="owner-name">Nombre</FieldLabel>
              <Input
                id="owner-name"
                autoComplete="off"
                aria-invalid={!!errors.ownerName}
                {...form.register('ownerName')}
              />
              <FieldDescription>Déjalo vacío si no lo sabes.</FieldDescription>
              <FieldError errors={[errors.ownerName]} />
            </Field>
            <FormError message={error} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              Guardar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
