import { ValidationError } from './domain-error.js';
import type { LocalDate } from './local-date.js';
import type { Money } from './money.js';
import type { UnitNumber } from './unit-number.js';

// The vocabulary of a cash row, shared by the live cashbook and the building's history
// (transcribed from the paper sheets): the same categories, held to the same rules.

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

export interface MovementDetails {
  readonly date: LocalDate;
  readonly category: MovementCategory;
  /** Always positive; the category gives the direction. */
  readonly amount: Money;
  readonly description: string | null;
  readonly unit: UnitNumber | null;
  /**
   * For a garbage row, the Monday of the week it pays for. It is stored, not derived from
   * the date, so a week paid late or early (even in another month) still counts as paid.
   */
  readonly week: LocalDate | null;
}

/** Checks a row against its category's rules; returns it with the description trimmed. */
export function validateMovement(details: MovementDetails): MovementDetails {
  const rule = CATEGORY_RULES[details.category];
  const description = details.description?.trim() || null;

  if (!details.amount.isPositive()) {
    throw new ValidationError(
      'MOVEMENT_AMOUNT_INVALID',
      `Amount must be positive, got ${details.amount}`,
    );
  }
  if (rule.requiresUnit && !details.unit) {
    throw new ValidationError('MOVEMENT_UNIT_REQUIRED', `${details.category} needs a depto`);
  }
  if (!rule.requiresUnit && details.unit) {
    throw new ValidationError(
      'MOVEMENT_UNIT_NOT_ALLOWED',
      `${details.category} cannot name a depto`,
    );
  }
  if (rule.requiresWeek && !details.week) {
    throw new ValidationError('MOVEMENT_WEEK_REQUIRED', `${details.category} needs a week`);
  }
  if (!rule.requiresWeek && details.week) {
    throw new ValidationError(
      'MOVEMENT_WEEK_NOT_ALLOWED',
      `${details.category} cannot name a week`,
    );
  }
  if (details.week && details.week.dayOfWeek !== 1) {
    throw new ValidationError(
      'MOVEMENT_WEEK_INVALID',
      `A week is named by its Monday, got ${details.week}`,
    );
  }
  if (rule.requiresDescription && !description) {
    throw new ValidationError(
      'MOVEMENT_DESCRIPTION_REQUIRED',
      `${details.category} needs a description`,
    );
  }
  return { ...details, description };
}

/** The amount with its sign for a balance: income adds, expenses subtract. */
export function signedAmountOf(details: MovementDetails): Money {
  return CATEGORY_RULES[details.category].direction === 'IN'
    ? details.amount
    : details.amount.negate();
}
