import {
  changePasswordFieldsSchema,
  distinctNewPassword,
  PASSWORD_MIN_LENGTH,
} from '@depadmin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import { useCurrentUser } from '@/lib/use-session';
import { useChangePassword } from '../api';

const formSchema = changePasswordFieldsSchema
  .extend({ confirmPassword: z.string() })
  .refine(distinctNewPassword.check, distinctNewPassword.params)
  .refine((form) => form.confirmPassword === form.newPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });

type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const navigate = useNavigate();
  const changePassword = useChangePassword();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const forced = user.mustChangePassword;

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null);
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      // The route guards read the user again (no longer required to change it).
      await router.invalidate();
      await navigate({ to: forced ? '/' : '/account', replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  });

  const field = (name: keyof FormValues, label: string, autoComplete: string) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        type="password"
        autoComplete={autoComplete}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{forced ? 'Elige tu contraseña' : 'Cambiar contraseña'}</h1>
        </CardTitle>
        <CardDescription>
          {forced
            ? 'Entraste con una contraseña temporal. Cámbiala por una tuya para continuar.'
            : 'Se cerrará tu sesión en tus otros dispositivos.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <FieldGroup>
            {field(
              'currentPassword',
              forced ? 'Contraseña temporal' : 'Contraseña actual',
              'current-password',
            )}
            {field('newPassword', 'Nueva contraseña', 'new-password')}
            {field('confirmPassword', 'Repite la nueva contraseña', 'new-password')}
            <FormError message={error} />
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
