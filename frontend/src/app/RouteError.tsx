import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages';

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-4">
      <Brand />
      {children}
    </div>
  );
}

/** A route failed to load, e.g. the server could not be reached while resuming the session. */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <Screen>
      <p>{errorMessage(error)}</p>
      <Button variant="outline" onClick={() => void router.invalidate()}>
        <ArrowClockwiseIcon />
        Reintentar
      </Button>
    </Screen>
  );
}

export function NotFound() {
  return (
    <Screen>
      <p>Esta página no existe.</p>
      <Link to="/" className="underline underline-offset-4">
        Ir al inicio
      </Link>
    </Screen>
  );
}
