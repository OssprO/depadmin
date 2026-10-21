import {
  ListBulletsIcon,
  ReceiptIcon,
  ToolboxIcon,
  UserCircleIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { MenuEntry, MenuList } from '@/components/MenuList';
import { SystemStatus } from '@/features/system-status/SystemStatus';
import { useCurrentUser } from '@/lib/use-session';

/** Everything that does not fit in the bottom bar, and the state of the system at its foot. */
export function MorePage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Más</h1>
      <MenuList>
        <MenuEntry
          to="/history"
          icon={<ListBulletsIcon />}
          title="Histórico"
          description="Todos los meses con su saldo"
        />
        <MenuEntry
          to="/accounts"
          icon={<ReceiptIcon />}
          title="Estados de cuenta"
          description="Adeudos y adelantos de cada depto"
        />
        <MenuEntry
          to="/tools"
          icon={<ToolboxIcon />}
          title="Herramientas"
          description="Para contar el efectivo de la caja"
        />
        {user.role === 'SUPERADMIN' && (
          <MenuEntry
            to="/admin"
            icon={<WrenchIcon />}
            title="Administración"
            description="Usuarios, deptos e inicio de la contabilidad"
          />
        )}
        <MenuEntry
          to="/account"
          icon={<UserCircleIcon />}
          title="Mi cuenta"
          description="Contraseña y cerrar sesión"
        />
      </MenuList>
      <footer className="border-t pt-4">
        <SystemStatus />
      </footer>
    </div>
  );
}
