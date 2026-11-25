import { CheckCircleIcon } from '@phosphor-icons/react';
import { Link, useLocation } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { FormError } from '@/components/FormError';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages';
import { useCurrentUser } from '@/lib/use-session';
import { userLabel } from '@/lib/user-label';
import { useConfirmEmail } from '../api';

/**
 * Where the confirmation email leads (`/account/email/confirm#<secret>`). It needs the session
 * of the account the email names: a stranger who got it by a typo cannot confirm it.
 */
export function ConfirmEmailPage() {
  const user = useCurrentUser();
  const token = useLocation({ select: (location) => location.hash });
  const confirm = useConfirmEmail();
  const sent = useRef(false);

  useEffect(() => {
    // Once, even when React runs effects twice in development.
    if (!token || sent.current) return;
    sent.current = true;
    confirm.mutate(token);
  }, [token, confirm]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Confirmar tu correo</h1>
        </CardTitle>
        <CardDescription>Cuenta {userLabel(user)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!token && (
          <FormError message="Este enlace está incompleto. Ábrelo desde el correo, tal como llegó." />
        )}
        {confirm.isPending && (
          <p role="status" className="text-muted-foreground">
            Confirmando tu correo…
          </p>
        )}
        {confirm.isSuccess && (
          <p role="status" className="flex items-start gap-2">
            <CheckCircleIcon className="mt-0.5 shrink-0" />
            <span>
              Listo: <span className="break-all font-medium">{confirm.data.email}</span> quedó
              confirmado. Ahí te llegará la recuperación de tu contraseña.
            </span>
          </p>
        )}
        <FormError message={confirm.isError ? errorMessage(confirm.error) : null} />
        <Link to="/account" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Ir a Mi cuenta
        </Link>
      </CardContent>
    </Card>
  );
}
