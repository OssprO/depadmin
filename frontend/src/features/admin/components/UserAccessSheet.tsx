import { UNIT_NUMBERS, type UnitNumberValue, type UserSummary } from '@depadmin/shared';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
import { FormSheetContent } from '@/components/FormSheetContent';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { errorMessage } from '@/lib/error-messages';
import { buildingToday } from '@/lib/format';
import { ROLES, userLabel } from '@/lib/user-label';
import { useChangeAccess, useSetUserEnabled } from '../api';
import { toUnit } from '../user-access';

/** A read-only user's depto: one of the ten, or none (an accountant). */
export function UnitField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="user-unit">Depto</FieldLabel>
      <NativeSelect
        id="user-unit"
        className="w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <NativeSelectOption value="">Ninguno (por ejemplo, un contador)</NativeSelectOption>
        {UNIT_NUMBERS.map((unit) => (
          <NativeSelectOption key={unit} value={unit}>
            Depto {unit}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

/** The last day a user can get in; empty for no end. */
export function ExpiryField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="user-expires">Vence</FieldLabel>
      <Input
        id="user-expires"
        type="date"
        min={buildingToday()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription>
        Último día que puede entrar. Vacío: no vence. Al vencer ya no entra y sus sesiones se
        cierran solas.
      </FieldDescription>
    </Field>
  );
}

/**
 * How long a user keeps access, a read-only user's depto, and switching the user off or
 * back on. For anyone but the superadmin.
 */
export function UserAccessSheet({ user }: { user: UserSummary }) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const change = useChangeAccess();
  const setEnabled = useSetUserEnabled();
  const label = userLabel(user);

  const save = async () => {
    setError(null);
    try {
      await change.mutateAsync({
        userId: user.id,
        body: {
          // An owner keeps its depto; only a reader's can change.
          unit: user.role === 'READER' ? toUnit(unit) : (user.unit as UnitNumberValue | null),
          expiresOn: expiresOn === '' ? null : expiresOn,
        },
      });
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const toggle = async () => {
    setError(null);
    try {
      await setEnabled.mutateAsync({ userId: user.id, on: user.disabled });
      setOpen(false);
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
          setUnit(user.unit === null ? '' : String(user.unit));
          setExpiresOn(user.expiresOn ?? '');
          setError(null);
        }
      }}
    >
      <SheetTrigger render={<Button variant="outline" size="sm" />}>Acceso</SheetTrigger>
      <FormSheetContent>
        <SheetHeader>
          <SheetTitle>Acceso de {label}</SheetTitle>
          <SheetDescription>{ROLES[user.role]}</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4">
          {user.role === 'READER' && <UnitField value={unit} onChange={setUnit} />}
          <ExpiryField value={expiresOn} onChange={setExpiresOn} />
          <FormError message={error} />
        </FieldGroup>
        <SheetFooter>
          <Button disabled={change.isPending} onClick={() => void save()}>
            Guardar
          </Button>
          <Button
            variant={user.disabled ? 'outline' : 'destructive'}
            disabled={setEnabled.isPending}
            onClick={() => void toggle()}
          >
            {user.disabled ? 'Reactivar' : 'Desactivar (cierra sus sesiones)'}
          </Button>
        </SheetFooter>
      </FormSheetContent>
    </Sheet>
  );
}
