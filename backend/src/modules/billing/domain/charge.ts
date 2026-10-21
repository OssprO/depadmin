import {
  type Money,
  type UnitNumber,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';

/** Listed in the order a payment covers them within the same month. */
export const CHARGE_TYPES = ['MAINTENANCE_FEE', 'SHIFT_SKIP_PENALTY'] as const;

export type ChargeType = (typeof CHARGE_TYPES)[number];

/**
 * Something a depto owes for a month. A depto has at most one charge of each type per month,
 * so (depto, month, type) identifies it and doubles as its key.
 */
export class Charge {
  private constructor(
    readonly unit: UnitNumber,
    readonly month: YearMonth,
    readonly type: ChargeType,
    readonly amount: Money,
  ) {}

  static create(unit: UnitNumber, month: YearMonth, type: ChargeType, amount: Money): Charge {
    if (!amount.isPositive()) {
      throw new ValidationError('CHARGE_AMOUNT_INVALID', `Charge must be positive, got ${amount}`);
    }
    return new Charge(unit, month, type, amount);
  }

  get key(): string {
    return `${this.unit}:${this.month}:${this.type}`;
  }
}

/** Payment order: oldest month first; within a month, the fee before the penalty. */
export function compareChargesForPayment(a: Charge, b: Charge): number {
  return a.month.compareTo(b.month) || CHARGE_TYPES.indexOf(a.type) - CHARGE_TYPES.indexOf(b.type);
}

/**
 * The fees a month still needs: one per active depto that does not have one yet. Running it
 * again returns nothing, so opening a month twice never charges twice.
 */
export function missingMaintenanceFees(
  month: YearMonth,
  activeUnits: readonly UnitNumber[],
  fee: Money,
  existing: readonly Charge[],
): Charge[] {
  const charged = new Set(existing.map((charge) => charge.key));
  return activeUnits
    .map((unit) => Charge.create(unit, month, 'MAINTENANCE_FEE', fee))
    .filter((charge) => !charged.has(charge.key));
}

/**
 * Penalties for a skipped shift: one per month the depto did not take, on top of its regular
 * fee ($500 + $700 = $1,200 per month at the initial rates).
 */
export function shiftSkipPenalties(
  unit: UnitNumber,
  skippedMonths: readonly YearMonth[],
  penaltyFor: (month: YearMonth) => Money,
): Charge[] {
  return skippedMonths.map((month) =>
    Charge.create(unit, month, 'SHIFT_SKIP_PENALTY', penaltyFor(month)),
  );
}
