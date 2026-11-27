import { CheckCircleIcon } from '@phosphor-icons/react';
import { Link, useLocation } from '@tanstack/react-router';
import { Brand } from '@/components/Brand';
import { FormError } from '@/components/FormError';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages';
import { useUnsubscribe } from '../api';

/** «la cuenta «502»», «las cuentas «admin» y «501»». */
function accountsText(usernames: readonly string[]): string {
  const quoted = usernames.map((username) => `«${username}»`);
  if (quoted.length === 1) return `la cuenta ${quoted[0]}`;
  return `las cuentas ${quoted.slice(0, -1).join(', ')} y ${quoted.at(-1)}`;
}

/**
 * Where the link at the foot of a notice's email leads (`/email/unsubscribe#<link>`), without
 * signing in (ADR-0034). Nothing changes until the button is pressed: the scanners that open
 * the links in emails do not press it.
 */
export function UnsubscribePage() {
  const token = useLocation({ select: (location) => location.hash });
  const unsubscribe = useUnsubscribe();

  let content;
  if (unsubscribe.isSuccess) {
    content = (
      <>
        <p role="status" className="flex items-start gap-2">
          <CheckCircleIcon className="mt-0.5 shrink-0" />
          <span>
            Listo: {accountsText(unsubscribe.data.accounts)} ya no{' '}
            {unsubscribe.data.accounts.length === 1 ? 'recibe' : 'reciben'} los avisos por correo.
            Siguen en la app, y puedes volver a activarlos en «Mi cuenta».
          </span>
        </p>
        <Link to="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Ir a la app
        </Link>
      </>
    );
  } else if (!token) {
    content = (
      <FormError message="Este enlace está incompleto. Ábrelo desde el correo, tal como llegó." />
    );
  } else {
    content = (
      <>
        <p>
          Dejarás de recibir por correo los avisos del edificio en la dirección donde te llegó este
          enlace. Los avisos siguen en la app, y los correos de seguridad te siguen llegando.
        </p>
        <FormError message={unsubscribe.isError ? errorMessage(unsubscribe.error) : null} />
        <Button
          size="lg"
          disabled={unsubscribe.isPending}
          onClick={() => unsubscribe.mutate(token)}
        >
          {unsubscribe.isPending ? 'Guardando…' : 'Dejar de recibirlos'}
        </Button>
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <Brand />
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Avisos por correo</h1>
          </CardTitle>
          <CardDescription>DepAdmin, la app de tu edificio.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{content}</CardContent>
      </Card>
    </main>
  );
}
