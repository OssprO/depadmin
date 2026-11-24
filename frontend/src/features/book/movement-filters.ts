import {
  type Movement,
  type MovementCategory,
  movementCategorySchema,
  type UnitNumberValue,
  unitNumberSchema,
} from '@depadmin/shared';

/**
 * What the book's rows are narrowed to. It lives in the address
 * (`/book/2026-10?depto=301&tipo=UNIT_PAYMENT&q=agua`), so it stays while moving between
 * months and «Atrás» undoes it. Only on the screen: the API sends the whole month.
 */
export interface MovementFilters {
  /** Text in a row's description (an expense) or observations (a payment). */
  readonly q?: string;
  readonly depto?: UnitNumberValue;
  readonly tipo?: MovementCategory;
}

/** Keeps only the filters the address states correctly; anything else is dropped. */
export function movementFiltersFrom(search: Record<string, unknown>): MovementFilters {
  const q = typeof search['q'] === 'string' ? search['q'] : '';
  const depto = unitNumberSchema.safeParse(Number(search['depto']));
  const tipo = movementCategorySchema.safeParse(search['tipo']);
  return {
    ...(q.trim() && { q }),
    ...(depto.success && { depto: depto.data }),
    ...(tipo.success && { tipo: tipo.data }),
  };
}

export const hasFilters = (filters: MovementFilters): boolean =>
  !!(filters.q?.trim() || filters.depto || filters.tipo);

/** Lowercase and without accents, so «limpieza» finds «Limpíeza» and «AGUA» finds «agua». */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** The rows that meet every filter given. */
export function filterMovements(
  movements: readonly Movement[],
  { q, depto, tipo }: MovementFilters,
): Movement[] {
  const text = fold(q?.trim() ?? '');
  return movements.filter(
    (movement) =>
      (!depto || movement.unit === depto) &&
      (!tipo || movement.category === tipo) &&
      (!text || fold(movement.description ?? '').includes(text)),
  );
}

export const MOVEMENT_ORDERS = ['oldest', 'newest'] as const;
export type MovementOrder = (typeof MOVEMENT_ORDERS)[number];

/** The API sends the rows oldest first; newest first is the same list turned around. */
export function inOrder(movements: readonly Movement[], order: MovementOrder): Movement[] {
  return order === 'newest' ? [...movements].reverse() : [...movements];
}
