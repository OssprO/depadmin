import {
  ArchiveIcon,
  BuildingsIcon,
  FlagIcon,
  ScalesIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
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
          description="Propietarios, activos e inactivos"
        />
        <MenuEntry
          to="/admin/start"
          icon={<FlagIcon />}
          title="Inicio de la contabilidad"
          description="Primer mes y efectivo en caja"
        />
        <MenuEntry
          to="/admin/opening"
          icon={<ScalesIcon />}
          title="Carga inicial"
          description="Adeudos y adelantos de cada depto al empezar"
        />
        <MenuEntry
          to="/admin/history"
          icon={<ArchiveIcon />}
          title="Historial"
          description="Los balances en papel desde 2022, para revisarlos"
        />
      </MenuList>
    </div>
  );
}
