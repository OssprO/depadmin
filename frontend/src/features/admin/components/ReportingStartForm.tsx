import { type ReportingStart, reportingStartSchema } from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import { parsePesos, PESOS_PATTERN, pesosInput } from '@/lib/format';
import { useSetReportingStart } from '../api';

interface FormValues {
  month: string;
  openingBalance: string;
}

const formSchema = z
  .object({
    month: z.string(),
    openingBalance: z
      .string()
      .trim()
      .regex(PESOS_PATTERN, 'Escribe un importe, por ejemplo 5000 o 5000.50'),
  })
  .transform((form) => ({ month: form.month, openingBalance: parsePesos(form.openingBalance) }))
  .pipe(reportingStartSchema);

export function ReportingStartForm({ start }: { start: ReportingStart | null }) {
  const save = useSetReportingStart();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<FormValues, unknown, ReportingStart>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      month: start?.month ?? '',
      openingBalance: start ? pesosInput(start.openingBalance) : '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (body) => {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(body);
      setSaved(true);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.month}>
          <FieldLabel htmlFor="start-month">Primer mes</FieldLabel>
          <Input
            id="start-month"
            type="month"
            aria-invalid={!!errors.month}
            {...form.register('month')}
          />
          <FieldDescription>Ya no cambia una vez que se abre ese mes.</FieldDescription>
          <FieldError errors={[errors.month]} />
        </Field>
        <Field data-invalid={!!errors.openingBalance}>
          <FieldLabel htmlFor="start-balance">Efectivo en caja al empezar ($)</FieldLabel>
          <Input
            id="start-balance"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={!!errors.openingBalance}
            {...form.register('openingBalance')}
          />
          <FieldDescription>Se puede corregir hasta que se cierre el primer mes.</FieldDescription>
          <FieldError errors={[errors.openingBalance]} />
        </Field>
        <FormError message={error} />
        {saved && (
          <p role="status" className="text-muted-foreground">
            Guardado.
          </p>
        )}
        <Button type="submit" disabled={isSubmitting} className="self-start">
          Guardar
        </Button>
      </FieldGroup>
    </form>
  );
}
