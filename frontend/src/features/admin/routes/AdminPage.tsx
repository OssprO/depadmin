import { BuildingsIcon, FlagIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { MenuEntry, MenuList } from '@/components/MenuList';

/** The superadmin's tools. */
export function AdminPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Administración</h1>
      <MenuList>
        <MenuEntry
          to="/admin/users"
          icon={<UsersThreeIcon />}
          title="Usuarios"
          description="Acceso de cada depto y contraseñas temporales"
        />
        <MenuEntry
          to="/admin/units"
          icon={<BuildingsIcon />}
          title="Deptos"
          description="Activos e inactivos"
        />
        <MenuEntry
          to="/admin/start"
          icon={<FlagIcon />}
          title="Inicio de la contabilidad"
          description="Primer mes y efectivo en caja"
        />
      </MenuList>
    </div>
  );
}
