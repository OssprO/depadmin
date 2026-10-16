import { createReaderRequestSchema } from '@depadmin/shared';
import { CheckIcon, CopyIcon, UserPlusIcon } from '@phosphor-icons/react';
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
import { errorMessage } from '@/lib/error-messages';
import { useCreateReader } from '../api';
import { toUnit } from '../user-access';
import { ExpiryField, UnitField } from './UserAccessSheet';

/**
 * A read-only user: a tenant or a relative of a depto, or someone of none (an accountant).
 * It sees everything an owner sees and never writes. The temporary password is shown once,
 * to pass on; at first sign-in they choose their own.
 */
export function NewReaderSheet() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [unit, setUnit] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useCreateReader();
  const created = create.data;

  const submit = async () => {
    setError(null);
    const parsed = createReaderRequestSchema.safeParse({
      username,
      unit: toUnit(unit),
      expiresOn: expiresOn === '' ? null : expiresOn,
    });
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Revisa el nombre de usuario');
      return;
    }
    setInvalid(null);
    try {
      await create.mutateAsync(parsed.data);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUsername('');
          setUnit('');
          setExpiresOn('');
          setInvalid(null);
          setError(null);
          setCopied(false);
          create.reset();
        }
      }}
    >
      <SheetTrigger render={<Button variant="outline" className="self-start" />}>
        <UserPlusIcon /> Nuevo usuario de solo lectura
      </SheetTrigger>
      <FormSheetContent>
        <SheetHeader>
          <SheetTitle>
            {created
              ? `Contraseña temporal de ${created.user.username}`
              : 'Nuevo usuario de solo lectura'}
          </SheetTitle>
          <SheetDescription>
            {created
              ? 'Compártela con la persona. Al entrar, tendrá que elegir una propia. No se volverá a mostrar.'
              : 'Ve todo lo que ve un dueño y nunca puede cambiar nada.'}
          </SheetDescription>
        </SheetHeader>
        {created ? (
          <>
            <p
              className="mx-4 border p-3 text-center font-mono text-base tracking-wider select-all"
              data-testid="temporary-password"
            >
              {created.temporaryPassword}
            </p>
            <SheetFooter>
              <Button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(created.temporaryPassword)
                    .then(() => setCopied(true))
                }
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? 'Copiada' : 'Copiar'}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Listo
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <FieldGroup className="px-4">
              <Field data-invalid={!!invalid}>
                <FieldLabel htmlFor="user-username">Usuario</FieldLabel>
                <Input
                  id="user-username"
                  autoComplete="off"
                  autoCapitalize="none"
                  placeholder="por ejemplo, inquilino.302"
                  aria-invalid={!!invalid}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                <FieldDescription>
                  Con el que entrará. Un número solo es de un dueño.
                </FieldDescription>
                <FieldError errors={invalid ? [{ message: invalid }] : []} />
              </Field>
              <UnitField value={unit} onChange={setUnit} />
              <ExpiryField value={expiresOn} onChange={setExpiresOn} />
              <FormError message={error} />
            </FieldGroup>
            <SheetFooter>
              <Button disabled={create.isPending} onClick={() => void submit()}>
                {create.isPending ? 'Creando…' : 'Crear usuario'}
              </Button>
            </SheetFooter>
          </>
        )}
      </FormSheetContent>
    </Sheet>
  );
}
