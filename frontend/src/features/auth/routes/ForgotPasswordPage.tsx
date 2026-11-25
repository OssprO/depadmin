import { type PasswordRecoveryRequest, passwordRecoveryRequestSchema } from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Brand } from '@/components/Brand';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/error-messages';
import { recoveryAvailabilityQueryOptions, useRequestRecovery } from '../api';

/** The answer is always this one, so it never tells who has an account or an email. */
const SENT =
  'Si ese usuario tiene un correo confirmado, te enviamos un enlace. Vence en 1 hora: revisa también la carpeta de spam. Si no tienes correo registrado, pídele al superadmin una contraseña temporal.';

function failure(error: unknown): string {
  // Here the limit is per hour, not per minute as in the login.
  if (error instanceof ApiError && error.code === 'TOO_MANY_REQUESTS') {
    return 'Se pidieron demasiados enlaces desde esta conexión. Espera una hora e inténtalo de nuevo.';
  }
  return errorMessage(error);
}

/** «¿Olvidaste tu contraseña?» (ADR-0033): asks for the username and sends a link. */
export function ForgotPasswordPage() {
  const availability = useQuery(recoveryAvailabilityQueryOptions);
  const request = useRequestRecovery();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PasswordRecoveryRequest>({
    resolver: zodResolver(passwordRecoveryRequestSchema),
    defaultValues: { username: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (body) => {
    setError(null);
    try {
      await request.mutateAsync(body);
    } catch (problem) {
      setError(failure(problem));
    }
  });

  const unavailable = availability.isSuccess && !availability.data.available;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <Brand />
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Recuperar tu contraseña</h1>
          </CardTitle>
          <CardDescription>
            Escribe tu usuario. Si tienes un correo confirmado, te llegará un enlace para elegir una
            contraseña nueva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unavailable ? (
            <p>
              La recuperación por correo todavía no está disponible. Pídele al superadmin una
              contraseña temporal.
            </p>
          ) : request.isSuccess ? (
            <p role="status">{SENT}</p>
          ) : (
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
                <FormError message={error} />
                <Button type="submit" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </p>
    </main>
  );
}
