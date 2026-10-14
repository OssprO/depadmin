import {
  CATEGORY_RULES,
  type Movement,
  type MovementCategory,
  type PaymentCoverage,
} from '@depadmin/shared';
import { formatMonthShort } from '@/lib/format';

export const CATEGORIES: Record<MovementCategory, string> = {
  UNIT_PAYMENT: 'Pago de depto',
  OTHER_INCOME: 'Otro ingreso',
  GARBAGE: 'Basura',
  CLEANING: 'Limpieza',
  OTHER_EXPENSE: 'Otro egreso',
};

export const isIncome = (category: MovementCategory) => CATEGORY_RULES[category].direction === 'IN';

/** The row's main line: who paid, or what it was. */
export function movementTitle(movement: Movement): string {
  if (movement.category === 'UNIT_PAYMENT') return `Pago Depto ${movement.unit}`;
  return movement.description ?? CATEGORIES[movement.category];
}

function monthName(coverage: PaymentCoverage, year: string): string {
  const name = formatMonthShort(coverage.month);
  const label = coverage.month.startsWith(year) ? name : `${name} ${coverage.month.slice(0, 4)}`;
  return coverage.type === 'SHIFT_SKIP_PENALTY' ? `multa de ${label}` : label;
}

function list(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

/**
 * What a payment covered, e.g. "cubre sep y oct", "cubre ago y abono a sep", "abono a ago"
 * or "adelanto" when nothing was owed yet.
 */
export function describeCoverage(movement: Movement): string | null {
  if (movement.category !== 'UNIT_PAYMENT') return null;
  const year = movement.date.slice(0, 4);
  const settled = movement.coverage.filter((c) => c.settles).map((c) => monthName(c, year));
  const partial = movement.coverage.filter((c) => !c.settles).map((c) => monthName(c, year));
  const covered = movement.coverage.reduce((sum, c) => sum + c.amount, 0);
  const parts = [
    settled.length > 0 && `cubre ${list(settled)}`,
    partial.length > 0 && `abono a ${list(partial)}`,
    covered < movement.amount && 'adelanto',
  ].filter((part): part is string => typeof part === 'string');
  return list(parts);
}
