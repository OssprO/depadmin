import type { UserSummary } from '@depadmin/shared';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages';
import { userLabel } from '@/lib/user-label';
import { EmailSheet } from '@/features/account/components/EmailSheet';
import { useChangeUserEmail } from '../api';

/**
 * Someone's email, from the building's list (ADR-0033). The person confirms it from the link,
 * signed in with their own account; until then the app writes nothing else to it.
 */
export function UserEmailSheet({ user }: { user: UserSummary }) {
  const change = useChangeUserEmail();
  const [error, setError] = useState<string | null>(null);
  const label = userLabel(user);
  const current = user.pendingEmail ?? user.email;

  return (
    <EmailSheet
      trigger={
        <Button variant="outline" size="sm">
          Correo
        </Button>
      }
      title={`Correo de ${label}`}
      description={
        user.email
          ? `Confirmado: ${user.email}. Uno nuevo lo reemplaza cuando se confirme.`
          : 'La persona lo confirma con el enlace que le llega, entrando con su cuenta.'
      }
      initial={current ?? ''}
      onSave={(email) => change.mutateAsync({ userId: user.id, email })}
      extra={(close) =>
        current && (
          <>
            <Button
              variant="ghost"
              disabled={change.isPending}
              onClick={() => {
                setError(null);
                change
                  .mutateAsync({ userId: user.id, email: null })
                  .then(close)
                  .catch((failure: unknown) => setError(errorMessage(failure)));
              }}
            >
              Quitar el correo
            </Button>
            <FormError message={error} />
          </>
        )
      }
    />
  );
}
