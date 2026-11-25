import { newPasswordSchema, PASSWORD_MIN_LENGTH } from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Brand } from '@/components/Brand';
import { FormError } from '@/components/FormError';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import { recoveryLinkQueryOptions, useCompleteRecovery } from '../api';

const formSchema = z
  .object({ newPassword: newPasswordSchema, confirmPassword: z.string() })
  .refine((form) => form.confirmPassword === form.newPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });

type FormValues = z.infer<typeof formSchema>;

const linkClass = 'font-medium text-foreground underline underline-offset-4';

/**
 * Where the recovery email leads (`/reset-password#<secret>`): first it asks whether the link
 * still works and for which account, then takes the new password. Every session of the
 * account ends, and the user signs in again.
 */
export function ResetPasswordPage() {
  const token = useLocation({ select: (location) => location.hash });
  const navigate = useNavigate();
  const link = useQuery({ ...recoveryLinkQueryOptions(token), enabled: !!token });
  const complete = useCompleteRecovery();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ newPassword }) => {
    setError(null);
    try {
      await complete.mutateAsync({ token, newPassword });
      // The link is used up: it leaves the address, and the history.
      await navigate({ to: '/reset-password', hash: '', replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  });

  const field = (name: keyof FormValues, label: string) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        type="password"
        autoComplete="new-password"
        aria-invalid={!!errors[name]}
        {...form.register(name)}
      />
      {name === 'newPassword' && (
        <FieldDescription>
          Al menos {PASSWORD_MIN_LENGTH} caracteres. Una frase fácil de recordar funciona bien.
        </FieldDescription>
      )}
      <FieldError errors={[errors[name]]} />
    </Field>
  );

  let content;
  if (complete.isSuccess) {
    content = (
      <>
        <p role="status" className="flex items-start gap-2">
          <CheckCircleIcon className="mt-0.5 shrink-0" />
          <span>
            Listo: tu contraseña cambió y se cerraron tus sesiones en todos tus dispositivos. Entra
            con la nueva.
          </span>
        </p>
        <Link to="/login" className={buttonVariants({ size: 'lg' })}>
          Iniciar sesión
        </Link>
      </>
    );
  } else if (!token || link.isError) {
    content = (
      <>
        <FormError
          message={
            token
              ? errorMessage(link.error)
              : 'Este enlace está incompleto. Ábrelo desde el correo, tal como llegó.'
          }
        />
        <Link to="/forgot-password" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Pedir otro enlace
        </Link>
      </>
    );
  } else if (link.isPending) {
    content = (
      <p role="status" className="text-muted-foreground">
        Revisando el enlace…
      </p>
    );
  } else {
    content = (
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <FieldGroup>
          {/* For password managers, which save the new password under this account. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={link.data.username}
            readOnly
            hidden
          />
          {field('newPassword', 'Nueva contraseña')}
          {field('confirmPassword', 'Repite la nueva contraseña')}
          <FormError message={error} />
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <Brand />
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Nueva contraseña</h1>
          </CardTitle>
          {link.isSuccess && !complete.isSuccess && (
            <CardDescription>Para la cuenta «{link.data.username}».</CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{content}</CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        <Link to="/login" className={linkClass}>
          Volver a iniciar sesión
        </Link>
      </p>
    </main>
  );
}
