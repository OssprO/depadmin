import type { UserSummary } from '@depadmin/shared';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatFullDate } from '@/lib/format';
import { ROLES, userLabel } from '@/lib/user-label';
import { usersQueryOptions } from '../api';
import { NewReaderSheet } from '../components/NewReaderSheet';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog';
import { UserAccessSheet } from '../components/UserAccessSheet';

/** Whether the user can get in now, and why not. */
function AccessBadge({ user }: { user: UserSummary }) {
  if (user.disabled) return <Badge variant="destructive">Desactivado</Badge>;
  if (user.expired) return <Badge variant="destructive">Vencido</Badge>;
  if (!user.hasPassword) return <Badge variant="outline">Sin acceso</Badge>;
  if (user.mustChangePassword) return <Badge variant="secondary">Temporal</Badge>;
  return <Badge>Activa</Badge>;
}

/** "Solo lectura · Depto 302 · vence el 31 de diciembre de 2026". */
function details(user: UserSummary): string {
  const parts = [ROLES[user.role]];
  if (user.role === 'READER') parts.push(user.unit === null ? 'sin depto' : `Depto ${user.unit}`);
  if (user.expiresOn) parts.push(`vence el ${formatFullDate(user.expiresOn)}`);
  return parts.join(' · ');
}

/**
 * Who can get in (phase 14): the owners, the read-only users (tenants, relatives, an
 * accountant) and how long each keeps access. Only the superadmin sees it.
 */
export function UsersPage() {
  const users = useQuery(usersQueryOptions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Usuarios</h1>
      <NewReaderSheet />
      <Card>
        <CardHeader>
          <CardTitle>Quién puede entrar</CardTitle>
          <CardDescription>
            Da a cada persona una contraseña temporal; al entrar, elige la suya. Los usuarios de
            solo lectura ven todo y nunca cambian nada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.isPending && <p className="text-muted-foreground">Cargando…</p>}
          {users.isError && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground">No se pudo cargar la lista.</p>
              <Button variant="outline" size="sm" onClick={() => void users.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {users.isSuccess && (
            <ul className="divide-y">
              {users.data.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{userLabel(user)}</span>
                      <AccessBadge user={user} />
                    </span>
                    <span className="text-muted-foreground">{details(user)}</span>
                  </span>
                  {user.role !== 'SUPERADMIN' && (
                    <span className="flex gap-2">
                      <UserAccessSheet user={user} />
                      <ResetPasswordDialog user={user} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
