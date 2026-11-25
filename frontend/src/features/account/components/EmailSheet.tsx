import { emailAddressSchema } from '@depadmin/shared';
import { type FormEvent, type ReactElement, type ReactNode, useState } from 'react';
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

interface EmailSheetProps {
  /** What opens it, e.g. «Agregar correo». */
  readonly trigger: ReactElement;
  readonly title: string;
  readonly description: string;
  /** The address the field starts with. */
  readonly initial: string;
  /** Saves the address; the sheet closes when it resolves. */
  readonly onSave: (email: string) => Promise<unknown>;
  /** More actions under the button (the superadmin's «Quitar el correo»), given a way to close. */
  readonly extra?: (close: () => void) => ReactNode;
}

/**
 * Captures an address to confirm: in _Mi cuenta_ for oneself, and in _Usuarios_ for the
 * superadmin. A confirmation link goes to it when saved.
 */
export function EmailSheet({
  trigger,
  title,
  description,
  initial,
  onSave,
  extra,
}: EmailSheetProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initial);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = emailAddressSchema.safeParse(email);
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Escribe un correo válido');
      return;
    }
    setInvalid(null);
    setSaving(true);
    try {
      await onSave(parsed.data);
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setEmail(initial);
          setInvalid(null);
          setError(null);
        }
      }}
    >
      <SheetTrigger render={trigger} />
      <FormSheetContent>
        <form onSubmit={(event) => void save(event)} noValidate>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            <Field data-invalid={!!invalid}>
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!invalid}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <FieldDescription>
                A ese correo llegará un enlace para confirmarlo, que vence en 60 días. Hasta
                entonces, la app no escribe nada más ahí.
              </FieldDescription>
              <FieldError errors={invalid ? [{ message: invalid }] : []} />
            </Field>
            <FormError message={error} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enviando…' : 'Guardar y enviar el enlace'}
            </Button>
            {extra?.(() => setOpen(false))}
          </SheetFooter>
        </form>
      </FormSheetContent>
    </Sheet>
  );
}
