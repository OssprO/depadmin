import { CoinsIcon } from '@phosphor-icons/react';
import { MenuEntry, MenuList } from '@/components/MenuList';

/** Utilities for whoever handles the building's money; none of them touches the books. */
export function ToolsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Herramientas</h1>
      <MenuList>
        <MenuEntry
          to="/tools/cash"
          icon={<CoinsIcon />}
          title="Contador de efectivo"
          description="Suma los billetes y monedas de la caja"
        />
      </MenuList>
    </div>
  );
}
