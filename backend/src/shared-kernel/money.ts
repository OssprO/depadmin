import { ValidationError } from './domain-error.js';

/**
 * An amount of Mexican pesos stored as integer centavos, so arithmetic is exact.
 * Immutable; every operation returns a new instance. Negative values are allowed because
 * balances can go below zero; whether an amount must be positive is each caller's rule.
 */
export class Money {
  private constructor(readonly centavos: number) {}

  static readonly ZERO = new Money(0);

  static ofCentavos(centavos: number): Money {
    if (!Number.isSafeInteger(centavos)) {
      throw new ValidationError('MONEY_INVALID', `Money must be whole centavos, got ${centavos}`);
    }
    // Normalize -0 so equality and serialization never surprise.
    return new Money(centavos === 0 ? 0 : centavos);
  }

  /** Convenience for literals such as `Money.ofPesos(700)`; rejects fractions of a centavo. */
  static ofPesos(pesos: number): Money {
    const centavos = Math.round(pesos * 100);
    if (Math.abs(centavos - pesos * 100) > 1e-6) {
      throw new ValidationError('MONEY_INVALID', `${pesos} has more than two decimals`);
    }
    return Money.ofCentavos(centavos);
  }

  static sum(amounts: Iterable<Money>): Money {
    let total = 0;
    for (const amount of amounts) total += amount.centavos;
    return Money.ofCentavos(total);
  }

  static min(a: Money, b: Money): Money {
    return a.centavos <= b.centavos ? a : b;
  }

  static max(a: Money, b: Money): Money {
    return a.centavos >= b.centavos ? a : b;
  }

  plus(other: Money): Money {
    return Money.ofCentavos(this.centavos + other.centavos);
  }

  minus(other: Money): Money {
    return Money.ofCentavos(this.centavos - other.centavos);
  }

  times(factor: number): Money {
    if (!Number.isInteger(factor)) {
      throw new ValidationError('MONEY_INVALID', `Money can only be multiplied by integers`);
    }
    return Money.ofCentavos(this.centavos * factor);
  }

  negate(): Money {
    return Money.ofCentavos(-this.centavos);
  }

  isZero(): boolean {
    return this.centavos === 0;
  }

  isPositive(): boolean {
    return this.centavos > 0;
  }

  isNegative(): boolean {
    return this.centavos < 0;
  }

  equals(other: Money): boolean {
    return this.centavos === other.centavos;
  }

  compareTo(other: Money): number {
    return Math.sign(this.centavos - other.centavos);
  }

  isGreaterThan(other: Money): boolean {
    return this.centavos > other.centavos;
  }

  /** Plain decimal form for logs and tests, e.g. `-1200.50`. Display formatting lives in the UI. */
  toString(): string {
    const sign = this.centavos < 0 ? '-' : '';
    const abs = Math.abs(this.centavos);
    return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }

  toJSON(): number {
    return this.centavos;
  }
}
