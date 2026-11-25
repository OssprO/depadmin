import { type LoginRequest, loginRequestSchema } from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Brand } from '@/components/Brand';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import { safeRedirect } from '@/lib/safe-redirect';
import { useSessionStore } from '@/lib/use-session';
import { recoveryAvailabilityQueryOptions } from '../api';

const route = getRouteApi('/login');

export function LoginPage() {
  const { redirect } = route.useSearch();
  const navigate = useNavigate();
  const session = useSessionStore();
  // Offered only once the app can send the link; until then, the superadmin gives one.
  const recovery = useQuery(recoveryAvailabilityQueryOptions);
  const canRecover = recovery.data?.available === true;
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { username: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (credentials) => {
    setError(null);
    try {
      await session.login(credentials);
      await navigate({ href: safeRedirect(redirect), replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <Brand />
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Iniciar sesión</h1>
          </CardTitle>
          <CardDescription>
            Si eres dueño, tu usuario es el número de tu depto, por ejemplo 501. Si no, el que te
            dio el administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void onSubmit(event)} noValidate>
            <FieldGroup>
              <Field data-invalid={!!errors.username}>
                <FieldLabel htmlFor="username">Usuario</FieldLabel>
                <Input
                  id="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={!!errors.username}
                  {...form.register('username')}
                />
                <FieldError errors={[errors.username]} />
              </Field>
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...form.register('password')}
                />
                <FieldError errors={[errors.password]} />
              </Field>
              <FormError message={error} />
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? 'Entrando…' : 'Entrar'}
              </Button>
              {canRecover && (
                <Link
                  to="/forgot-password"
                  className="self-center text-sm font-medium underline underline-offset-4"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              )}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
        {!canRecover && <p>¿Olvidaste tu contraseña? Pídele al superadmin una temporal.</p>}
        <p>
          ¿Es tu primera vez?{' '}
          <Link to="/help" className="font-medium text-foreground underline underline-offset-4">
            Lee la guía paso a paso
          </Link>
        </p>
      </div>
    </main>
  );
}
