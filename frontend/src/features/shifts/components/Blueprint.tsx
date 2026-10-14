import { type ShiftMonth, UNIT_NUMBERS } from '@depadmin/shared';
import { cn } from '@/lib/utils';

/** Floors from the top down, as the building stands: 501 502 / 401 402 / … / 101 102. */
const LAYOUT = [...UNIT_NUMBERS].sort((a, b) => Math.floor(b / 100) - Math.floor(a / 100) || a - b);

type CellState = 'holder' | 'delegating' | 'covering' | 'uncovered' | 'inactive' | 'idle';

const STATES: Record<CellState, { label: string; className: string }> = {
  holder: { label: 'En turno', className: 'bg-primary text-primary-foreground' },
  delegating: { label: 'Delegó', className: 'bg-primary/25 text-foreground' },
  covering: {
    label: 'Cubre',
    className:
      'bg-primary text-primary-foreground outline-2 outline-offset-2 outline-dashed outline-primary',
  },
  uncovered: {
    label: 'Sin cubrir',
    className: 'border border-dashed border-destructive text-destructive',
  },
  inactive: { label: 'Inactivo', className: 'bg-muted text-muted-foreground line-through' },
  idle: { label: '', className: 'bg-muted/40 text-muted-foreground' },
};

function stateOf(unit: number, month: ShiftMonth, inactiveUnits: readonly number[]): CellState {
  const { scheduledUnit, delegation, responsibleUnits } = month;
  if (delegation?.delegateUnit === unit) return 'covering';
  if (unit === scheduledUnit) {
    if (!month.scheduledUnitActive) return responsibleUnits.length > 0 ? 'inactive' : 'uncovered';
    return delegation ? 'delegating' : 'holder';
  }
  return inactiveUnits.includes(unit) ? 'inactive' : 'idle';
}

interface BlueprintProps {
  readonly month: ShiftMonth;
  readonly inactiveUnits: readonly number[];
  /** The viewer's depto, marked "Tú". */
  readonly ownUnit?: number | null;
}

/** The building as a 2 × 5 grid with this month's shift highlighted (spec 4.5). */
export function Blueprint({ month, inactiveUnits, ownUnit = null }: BlueprintProps) {
  return (
    <ul
      aria-label="Edificio"
      className="mx-auto grid w-full max-w-60 grid-cols-2 gap-2 border-2 border-foreground/70 p-2"
    >
      {LAYOUT.map((unit) => {
        const state = STATES[stateOf(unit, month, inactiveUnits)];
        return (
          <li
            key={unit}
            aria-label={[`Depto ${unit}`, state.label, unit === ownUnit && 'tú']
              .filter(Boolean)
              .join(', ')}
            className={cn(
              'flex aspect-[3/2] flex-col items-center justify-center gap-0.5',
              state.className,
            )}
          >
            <span className="text-sm font-bold tabular-nums">{unit}</span>
            <span className="text-[0.6rem] leading-none uppercase">
              {state.label || (unit === ownUnit ? 'Tú' : ' ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
