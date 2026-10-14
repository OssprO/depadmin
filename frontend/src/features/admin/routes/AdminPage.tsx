import { BuildingsIcon, CaretRightIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface EntryProps {
  readonly to: NonNullable<LinkProps['to']>;
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
}

function Entry({ to, icon, title, description }: EntryProps) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 py-3 [&>svg]:size-6">
        {icon}
        <span className="flex flex-1 flex-col">
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground">{description}</span>
        </span>
        <CaretRightIcon className="text-muted-foreground" />
      </Link>
    </li>
  );
}

/** The superadmin's tools. */
export function AdminPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Administración</h1>
      <Card>
        <CardContent>
          <ul className="divide-y">
            <Entry
              to="/admin/users"
              icon={<UsersThreeIcon />}
              title="Usuarios"
              description="Acceso de cada depto y contraseñas temporales"
            />
            <Entry
              to="/admin/units"
              icon={<BuildingsIcon />}
              title="Deptos"
              description="Activos e inactivos"
            />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
