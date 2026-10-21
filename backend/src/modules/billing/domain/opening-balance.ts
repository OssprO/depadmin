import {
  ConflictError,
  LocalDate,
  Money,
  type UnitNumber,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { type Charge, compareChargesForPayment } from './charge.js';
import type { UnitPayment } from './payment-allocation.js';

/** What a depto had paid in advance when the books started (initial load). */
export interface OpeningCredit {
  readonly unit: UnitNumber;
  /** The first month of the books. */
  readonly month: YearMonth;
  readonly amount: Money;
}

/**
 * The adelanto carried into the books, as a payment made the day before they start: it then
 * covers the depto's charges oldest-first like any other payment. It never touches the cash,
 * which the reporting start already counts.
 */
export function openingPayment(credit: OpeningCredit): UnitPayment {
  return {
    id: `opening:${credit.unit}`,
    unit: credit.unit,
    date: LocalDate.firstOf(credit.month).plusDays(-1),
    amount: credit.amount,
  };
}

/**
 * Where a depto's account stood when the books started (initial load): what it still owed
 * from earlier months, as ordinary charges dated before the start (a partial month is a
 * charge for what was left), and what it had paid in advance.
 */
export class OpeningBalance {
  private constructor(
    readonly unit: UnitNumber,
    readonly start: YearMonth,
    readonly charges: readonly Charge[],
    readonly credit: Money,
  ) {}

  static of(
    unit: UnitNumber,
    start: YearMonth,
    charges: readonly Charge[],
    credit: Money,
  ): OpeningBalance {
    const keys = new Set<string>();
    for (const charge of charges) {
      if (charge.unit !== unit) {
        throw new ValidationError(
          'OPENING_BALANCE_INVALID',
          `${charge.key} is not depto ${unit}'s`,
        );
      }
      if (!charge.month.isBefore(start)) {
        throw new ValidationError(
          'OPENING_CHARGE_NOT_BEFORE_START',
          `${charge.key}: an opening debt belongs to a month before ${start}`,
        );
      }
      if (keys.has(charge.key)) {
        throw new ConflictError('OPENING_CHARGE_DUPLICATED', `${charge.key} is listed twice`);
      }
      keys.add(charge.key);
    }
    if (credit.isNegative()) {
      throw new ValidationError('OPENING_CREDIT_INVALID', `The adelanto cannot be ${credit}`);
    }
    return new OpeningBalance(unit, start, [...charges].sort(compareChargesForPayment), credit);
  }

  static empty(unit: UnitNumber, start: YearMonth): OpeningBalance {
    return new OpeningBalance(unit, start, [], Money.ZERO);
  }

  get debt(): Money {
    return Money.sum(this.charges.map((charge) => charge.amount));
  }

  get isEmpty(): boolean {
    return this.charges.length === 0 && this.credit.isZero();
  }

  get openingCredit(): OpeningCredit | null {
    return this.credit.isZero()
      ? null
      : { unit: this.unit, month: this.start, amount: this.credit };
  }
}

/** Port: the adelantos of the initial load. The debts live with the other charges. */
export interface OpeningCreditRepository {
  findAll(): Promise<OpeningCredit[]>;
  /** Replaces the depto's opening credit; null removes it. */
  save(unit: UnitNumber, credit: OpeningCredit | null): Promise<void>;
}

export const OPENING_CREDIT_REPOSITORY = Symbol('OpeningCreditRepository');
