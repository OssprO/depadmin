import { KeyIcon, SignOutIcon } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser, useSessionStore } from '@/lib/use-session';
import { userLabel } from '@/lib/user-label';

export function AccountPage() {
  const user = useCurrentUser();
  const session = useSessionStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    await session.logout();
    queryClient.clear(); // the next person on this phone must not see cached data
    await navigate({ to: '/login', replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Mi cuenta</h1>
      <Card>
        <CardHeader>
          <CardTitle>{userLabel(user)}</CardTitle>
          <CardAction>
            <Badge variant="outline">{user.role === 'SUPERADMIN' ? 'Superadmin' : 'Dueño'}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="text-muted-foreground">Usuario</dt>
            <dd className="text-right">{user.username}</dd>
          </dl>
        </CardContent>
      </Card>
      <Link to="/account/password" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        <KeyIcon />
        Cambiar contraseña
      </Link>
      <Button variant="destructive" size="lg" disabled={leaving} onClick={() => void logout()}>
        <SignOutIcon />
        Cerrar sesión
      </Button>
    </div>
  );
}
