import { MOVEMENT_CATEGORIES, UNIT_NUMBERS, type UnitNumberValue } from '@depadmin/shared';
import { ArrowsDownUpIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { CATEGORIES } from '../labels';
import { hasFilters, type MovementFilters, type MovementOrder } from '../movement-filters';

const ALL = '';

interface MovementToolbarProps {
  readonly filters: MovementFilters;
  readonly onFiltersChange: (filters: MovementFilters) => void;
  readonly order: MovementOrder;
  readonly onOrderChange: (order: MovementOrder) => void;
  /** Rows shown and rows in the month. */
  readonly shown: number;
  readonly total: number;
}

/** Search, depto and type over the month's rows, and their order. */
export function MovementToolbar(props: MovementToolbarProps) {
  const { filters, onFiltersChange, order, onOrderChange, shown, total } = props;
  /** Changes some filters; `undefined` takes one off. */
  const set = (patch: { [K in keyof MovementFilters]?: MovementFilters[K] | undefined }) => {
    const next: Record<string, unknown> = { ...filters, ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    onFiltersChange(next);
  };

  return (
    <div role="search" aria-label="Filtrar movimientos" className="flex flex-col gap-2">
      <div className="relative">
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar en descripciones y observaciones"
          placeholder="Buscar en descripciones y observaciones"
          className="pl-8"
          value={filters.q ?? ''}
          onChange={(event) => set({ q: event.target.value || undefined })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect
          aria-label="Filtrar por depto"
          className="w-full"
          value={filters.depto ?? ALL}
          onChange={(event) =>
            set({
              depto:
                event.target.value === ALL
                  ? undefined
                  : (Number(event.target.value) as UnitNumberValue),
            })
          }
        >
          <NativeSelectOption value={ALL}>Todos los deptos</NativeSelectOption>
          {UNIT_NUMBERS.map((unit) => (
            <NativeSelectOption key={unit} value={unit}>
              Depto {unit}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filtrar por tipo"
          className="w-full"
          value={filters.tipo ?? ALL}
          onChange={(event) =>
            set({
              tipo:
                event.target.value === ALL
                  ? undefined
                  : (event.target.value as (typeof MOVEMENT_CATEGORIES)[number]),
            })
          }
        >
          <NativeSelectOption value={ALL}>Todos los tipos</NativeSelectOption>
          {MOVEMENT_CATEGORIES.map((category) => (
            <NativeSelectOption key={category} value={category}>
              {CATEGORIES[category]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-muted-foreground">
          {hasFilters(filters) ? `${shown} de ${total} movimientos` : `${total} movimientos`}
        </p>
        <div className="flex items-center gap-1">
          {hasFilters(filters) && (
            <Button variant="ghost" size="sm" onClick={() => onFiltersChange({})}>
              Quitar filtros
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={order === 'newest'}
            onClick={() => onOrderChange(order === 'newest' ? 'oldest' : 'newest')}
          >
            <ArrowsDownUpIcon aria-hidden />
            Más recientes primero
          </Button>
        </div>
      </div>
    </div>
  );
}
