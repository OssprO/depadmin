export const MOVEMENT_CATEGORIES = [
  'UNIT_PAYMENT',
  'OTHER_INCOME',
  'GARBAGE',
  'CLEANING',
  'OTHER_EXPENSE',
] as const;

export type MovementCategory = (typeof MOVEMENT_CATEGORIES)[number];

export type Direction = 'IN' | 'OUT';

/**
 * What each category requires. Validation reads this table instead of branching on the
 * category, so adding a category means adding a row here (open/closed principle).
 */
export interface CategoryRule {
  readonly direction: Direction;
  /** UNIT_PAYMENT rows say which depto paid; no other row may name a depto. */
  readonly requiresUnit: boolean;
  /** Free-form rows need a description to make sense in the report. */
  readonly requiresDescription: boolean;
  /** Garbage is paid per calendar week, so its rows say which week; no other row may. */
  readonly requiresWeek: boolean;
}

export const CATEGORY_RULES: Readonly<Record<MovementCategory, CategoryRule>> = {
  UNIT_PAYMENT: {
    direction: 'IN',
    requiresUnit: true,
    requiresDescription: false,
    requiresWeek: false,
  },
  OTHER_INCOME: {
    direction: 'IN',
    requiresUnit: false,
    requiresDescription: true,
    requiresWeek: false,
  },
  GARBAGE: {
    direction: 'OUT',
    requiresUnit: false,
    requiresDescription: false,
    requiresWeek: true,
  },
  CLEANING: {
    direction: 'OUT',
    requiresUnit: false,
    requiresDescription: false,
    requiresWeek: false,
  },
  OTHER_EXPENSE: {
    direction: 'OUT',
    requiresUnit: false,
    requiresDescription: true,
    requiresWeek: false,
  },
};
