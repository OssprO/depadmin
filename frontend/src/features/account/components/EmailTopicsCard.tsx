import { useQuery } from '@tanstack/react-query';
import { FormError } from '@/components/FormError';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/error-messages';
import { accountEmailQueryOptions, useChangeEmailTopic } from '../api';

/**
 * Which optional emails the account gets (ADR-0034). The security notices (a password or an
 * address changed) are not among them: they always go out.
 */
export function EmailTopicsCard() {
  const email = useQuery(accountEmailQueryOptions);
  const change = useChangeEmailTopic();
  if (!email.isSuccess) return null;
  const receives = !email.data.optOuts.includes('NOTICES');

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Correos que recibo</h2>
        </CardTitle>
        <CardDescription>
          Los de seguridad, cuando cambian tu contraseña o tu correo, te llegan siempre.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="topic-notices">Avisos del edificio</FieldLabel>
            <FieldDescription>
              Los que publica la administración.
              {!email.data.email && ' Te llegarán cuando confirmes tu correo.'}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="topic-notices"
            checked={receives}
            disabled={change.isPending}
            onCheckedChange={(receive) => change.mutate({ topic: 'NOTICES', receive })}
          />
        </Field>
        <FormError message={change.isError ? errorMessage(change.error) : null} />
      </CardContent>
    </Card>
  );
}
