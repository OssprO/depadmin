import { EnvelopeSimpleIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages';
import { accountEmailQueryOptions, useChangeEmail, useRemoveEmail } from '../api';
import { EmailSheet } from './EmailSheet';

/**
 * The user's email in _Mi cuenta_ (ADR-0033): the confirmed one, the one waiting for its
 * link, and the buttons to add, change, resend or remove it.
 */
export function EmailCard() {
  const email = useQuery(accountEmailQueryOptions);
  const change = useChangeEmail();
  const remove = useRemoveEmail();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const send = async (address: string) => {
    setError(null);
    await change.mutateAsync({ email: address });
    setSentTo(address);
  };

  const resend = async (address: string) => {
    try {
      await send(address);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const confirmed = email.data?.email ?? null;
  const pending = email.data?.pendingEmail ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Correo</h2>
        </CardTitle>
        <CardDescription>
          Sirve para recuperar tu contraseña si la olvidas. La app solo te escribe lo necesario.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {email.isPending && <p className="text-muted-foreground">Cargando…</p>}
        {email.isError && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground">No se pudo cargar tu correo.</p>
            <Button variant="outline" size="sm" onClick={() => void email.refetch()}>
              Reintentar
            </Button>
          </div>
        )}
        {email.isSuccess && !confirmed && !pending && (
          <p className="text-muted-foreground">Aún no tienes correo.</p>
        )}
        {confirmed && (
          <p className="flex flex-wrap items-center gap-2">
            <span className="break-all">{confirmed}</span>
            <Badge>Confirmado</Badge>
          </p>
        )}
        {pending && (
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="break-all">{pending}</span>
              <Badge variant="secondary">Sin confirmar</Badge>
            </p>
            <p className="text-muted-foreground">
              Abre el enlace que te enviamos y entra con tu cuenta. Si no lo ves, revisa la carpeta
              de spam.
              {confirmed && ` Mientras tanto, la recuperación sigue llegando a ${confirmed}.`}
            </p>
          </div>
        )}
        {sentTo && (
          <p role="status" className="text-muted-foreground">
            Te enviamos el enlace a {sentTo}.
          </p>
        )}
        <FormError message={error} />
        {email.isSuccess && (
          <div className="flex flex-wrap gap-2">
            <EmailSheet
              trigger={
                <Button variant="outline" size="sm">
                  <EnvelopeSimpleIcon />
                  {confirmed || pending ? 'Cambiar correo' : 'Agregar correo'}
                </Button>
              }
              title={confirmed || pending ? 'Cambiar tu correo' : 'Agregar tu correo'}
              description="Escribe el correo donde quieres recibir los enlaces de la app."
              initial={pending ?? confirmed ?? ''}
              onSave={send}
            />
            {pending && (
              <Button
                variant="outline"
                size="sm"
                disabled={change.isPending}
                onClick={() => void resend(pending)}
              >
                Reenviar el enlace
              </Button>
            )}
            {(confirmed || pending) && (
              <AlertDialog open={removing} onOpenChange={setRemoving}>
                <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                  Quitar
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Quitar tu correo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Sin correo, si olvidas tu contraseña tendrás que pedirle una temporal al
                      superadmin.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        setSentTo(null);
                        setError(null);
                        remove.mutate(undefined, {
                          onSettled: () => setRemoving(false),
                          onError: (failure) => setError(errorMessage(failure)),
                        });
                      }}
                    >
                      Quitar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
