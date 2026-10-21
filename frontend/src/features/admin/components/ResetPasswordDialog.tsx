import type { UserSummary } from '@depadmin/shared';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages';
import { userLabel } from '@/lib/user-label';
import { useResetPassword } from '../api';

/**
 * Confirms, then shows the temporary password once so the superadmin can pass it on. It is
 * not stored anywhere readable: closing the dialog loses it (a new reset makes another).
 */
export function ResetPasswordDialog({ user }: { user: UserSummary }) {
  const reset = useResetPassword();
  const [copied, setCopied] = useState(false);
  const label = userLabel(user);
  const temporaryPassword = reset.data?.temporaryPassword;

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          reset.reset();
          setCopied(false);
        }
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        {user.hasPassword ? 'Restablecer' : 'Dar acceso'}
      </AlertDialogTrigger>
      <AlertDialogContent>
        {temporaryPassword ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Contraseña temporal de {label}</AlertDialogTitle>
              <AlertDialogDescription>
                Compártela con la persona. Al entrar, tendrá que elegir una propia. No se volverá a
                mostrar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p
              className="border p-3 text-center font-mono text-base tracking-wider select-all"
              data-testid="temporary-password"
            >
              {temporaryPassword}
            </p>
            <AlertDialogFooter>
              <Button onClick={() => void copy(temporaryPassword)}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? 'Copiada' : 'Copiar'}
              </Button>
              <AlertDialogCancel>Listo</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {user.hasPassword
                  ? `¿Restablecer la contraseña de ${label}?`
                  : `¿Dar acceso a ${label}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Se generará una contraseña temporal
                {user.hasPassword ? ' y se cerrarán sus sesiones abiertas' : ''}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <FormError message={reset.isError ? errorMessage(reset.error) : null} />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={reset.isPending} onClick={() => reset.mutate(user.id)}>
                {reset.isPending ? 'Generando…' : 'Generar contraseña'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
