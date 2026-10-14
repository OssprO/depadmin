import type { UserSummary } from '@depadmin/shared';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { userLabel } from '@/lib/user-label';
import { usersQueryOptions } from '../api';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog';

function AccessBadge({ user }: { user: UserSummary }) {
  if (!user.hasPassword) return <Badge variant="outline">Sin acceso</Badge>;
  if (user.mustChangePassword) return <Badge variant="secondary">Temporal</Badge>;
  return <Badge>Activa</Badge>;
}

export function UsersPage() {
  const users = useQuery(usersQueryOptions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Usuarios</h1>
      <Card>
        <CardHeader>
          <CardTitle>Acceso de los deptos</CardTitle>
          <CardDescription>
            Da a cada dueño una contraseña temporal; al entrar, elige la suya.
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
                <li key={user.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{userLabel(user)}</span>
                    <AccessBadge user={user} />
                  </span>
                  {user.role === 'OWNER' && <ResetPasswordDialog user={user} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
