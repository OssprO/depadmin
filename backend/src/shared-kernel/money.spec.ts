import { describe, expect, it } from 'vitest';
import { withCode } from '../../test/support/domain-error.js';
import { Money } from './money.js';

describe('Money', () => {
  it('stores whole centavos', () => {
    expect(Money.ofPesos(700).centavos).toBe(70000);
    expect(Money.ofPesos(150.5).centavos).toBe(15050);
    expect(Money.ofCentavos(1).toString()).toBe('0.01');
  });

  it('rejects fractions of a centavo and unsafe numbers', () => {
    expect(() => Money.ofCentavos(1.5)).toThrow(withCode('MONEY_INVALID'));
    expect(() => Money.ofCentavos(Number.NaN)).toThrow(withCode('MONEY_INVALID'));
    expect(() => Money.ofCentavos(Number.MAX_SAFE_INTEGER + 1)).toThrow(withCode('MONEY_INVALID'));
    expect(() => Money.ofPesos(0.001)).toThrow(withCode('MONEY_INVALID'));
  });

  it('does exact arithmetic where floats would drift', () => {
    const tenCents = Money.ofPesos(0.1);
    const total = Money.sum([tenCents, Money.ofPesos(0.2)]);
    expect(total.equals(Money.ofPesos(0.3))).toBe(true);
    expect(Money.ofPesos(700).times(10).toString()).toBe('7000.00');
    expect(Money.ofPesos(500).minus(Money.ofPesos(700)).toString()).toBe('-200.00');
    expect(Money.ofPesos(5).plus(Money.ofPesos(5)).negate().toString()).toBe('-10.00');
  });

  it('only multiplies by integers', () => {
    expect(() => Money.ofPesos(270).times(1.5)).toThrow(withCode('MONEY_INVALID'));
  });

  it('normalizes negative zero', () => {
    expect(Object.is(Money.ofCentavos(-0).centavos, 0)).toBe(true);
    expect(Money.ZERO.negate().isZero()).toBe(true);
  });

  it('compares amounts', () => {
    const small = Money.ofPesos(150);
    const big = Money.ofPesos(700);
    expect(small.compareTo(big)).toBe(-1);
    expect(big.compareTo(small)).toBe(1);
    expect(big.compareTo(Money.ofPesos(700))).toBe(0);
    expect(big.isGreaterThan(small)).toBe(true);
    expect(Money.min(big, small)).toBe(small);
    expect(Money.max(small, big)).toBe(big);
    expect(small.isPositive()).toBe(true);
    expect(small.negate().isNegative()).toBe(true);
    expect(Money.ZERO.isPositive()).toBe(false);
  });

  it('serializes as centavos', () => {
    expect(JSON.stringify({ amount: Money.ofPesos(1200) })).toBe('{"amount":120000}');
  });
});
