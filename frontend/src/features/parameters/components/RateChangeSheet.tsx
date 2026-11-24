import {
  RATE_AGREEMENT_MAX_LENGTH,
  type RateChangeRequest,
  rateChangeRequestSchema,
  type RateNameValue,
} from '@depadmin/shared';
import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { buildingToday, formatMoney, formatMonth, parsePesos } from '@/lib/format';
import { useChangeRate } from '../api';
import { RATES } from '../labels';

interface RateChangeSheetProps {
  readonly rate: RateNameValue;
  readonly current: number | null;
  /** The first month the change can apply from. */
  readonly earliestMonth: string;
}

type Errors = Partial<Record<keyof RateChangeRequest, string>>;

/** The shift administrator records a rate the assembly agreed, from a month not opened yet. */
export function RateChangeSheet({ rate, current, earliestMonth }: RateChangeSheetProps) {
  const change = useChangeRate();
  const [open, setOpen] = useState(false);
  const today = buildingToday();
  const blank = { from: earliestMonth, amount: '', agreedOn: today, agreement: '' };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Errors>({});
  const { title } = RATES[rate];

  const submit = async () => {
    const parsed = rateChangeRequestSchema.safeParse({
      rate,
      from: form.from,
      amount: parsePesos(form.amount),
      agreedOn: form.agreedOn,
      agreement: form.agreement,
    });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof RateChangeRequest;
        found[field] ??= field === 'amount' ? 'Escribe un importe mayor que cero' : issue.message;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    try {
      await change.mutateAsync(parsed.data);
      setOpen(false);
    } catch {
      // The error shows below the form.
    }
  };

  const field = (name: keyof typeof form) => ({
    value: form[name],
    'aria-invalid': !!errors[name],
    onChange: (event: { target: { value: string } }) =>
      setForm((values) => ({ ...values, [name]: event.target.value })),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setForm(blank);
          setErrors({});
          change.reset();
        }
      }}
    >
      <SheetTrigger render={<Button size="sm" variant="outline" />}>
        Programar cambio <span className="sr-only">de {title.toLowerCase()}</span>
      </SheetTrigger>
      <FormSheetContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {current === null ? 'Sin valor vigente.' : `Hoy es de ${formatMoney(current)}.`} El
              cambio lo acuerda la asamblea; aquí se registra lo acordado. Aplica desde un mes que
              todavía no se abre: lo más pronto, {formatMonth(earliestMonth)}.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.from}>
                <FieldLabel htmlFor="rate-from">Desde</FieldLabel>
                <Input id="rate-from" type="month" min={earliestMonth} {...field('from')} />
                <FieldError>{errors.from}</FieldError>
              </Field>
              <Field data-invalid={!!errors.amount}>
                <FieldLabel htmlFor="rate-amount">Importe ($)</FieldLabel>
                <Input
                  id="rate-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  {...field('amount')}
                />
                <FieldError>{errors.amount}</FieldError>
              </Field>
            </div>
            <Field data-invalid={!!errors.agreedOn}>
              <FieldLabel htmlFor="rate-agreed-on">Fecha de la asamblea</FieldLabel>
              <Input id="rate-agreed-on" type="date" max={today} {...field('agreedOn')} />
              <FieldError>{errors.agreedOn}</FieldError>
            </Field>
            <Field data-invalid={!!errors.agreement}>
              <FieldLabel htmlFor="rate-agreement">Qué se acordó</FieldLabel>
              <Textarea
                id="rate-agreement"
                rows={3}
                maxLength={RATE_AGREEMENT_MAX_LENGTH}
                {...field('agreement')}
              />
              <FieldDescription>Como lo dice el acta; queda en la bitácora.</FieldDescription>
              <FieldError>{errors.agreement}</FieldError>
            </Field>
            <FormError message={change.isError ? errorMessage(change.error) : null} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </SheetFooter>
        </form>
      </FormSheetContent>
    </Sheet>
  );
}
