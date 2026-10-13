import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { Money, UnitNumber } from '../../../shared-kernel/index.js';
import { CashMovement } from './cash-movement.js';
import { expense, otherIncome, payment, pesos } from './testing.js';

describe('CashMovement', () => {
  it('derives direction, sign and month from category and date', () => {
    const income = CashMovement.record('p1', payment('2026-09-03', 501));
    expect(income.direction).toBe('IN');
    expect(income.signedAmount.equals(pesos(700))).toBe(true);
    expect(String(income.month)).toBe('2026-09');

    const garbage = CashMovement.record('g1', expense('2026-09-06', 'GARBAGE', 150));
    expect(garbage.direction).toBe('OUT');
    expect(garbage.signedAmount.equals(pesos(-150))).toBe(true);
  });

  it('requires a positive amount', () => {
    expect(() => CashMovement.record('x', payment('2026-09-03', 501, 0))).toThrow(
      withCode('MOVEMENT_AMOUNT_INVALID'),
    );
    expect(() =>
      CashMovement.record('x', {
        ...expense('2026-09-03', 'GARBAGE', 150),
        amount: Money.ofPesos(-150),
      }),
    ).toThrow(withCode('MOVEMENT_AMOUNT_INVALID'));
  });

  it('requires a depto on unit payments and forbids it elsewhere', () => {
    expect(() => CashMovement.record('x', { ...payment('2026-09-03', 501), unit: null })).toThrow(
      withCode('MOVEMENT_UNIT_REQUIRED'),
    );
    expect(() =>
      CashMovement.record('x', {
        ...expense('2026-09-03', 'CLEANING', 270),
        unit: UnitNumber.of(501),
      }),
    ).toThrow(withCode('MOVEMENT_UNIT_NOT_ALLOWED'));
  });

  it('requires a description on free-form rows and trims it', () => {
    expect(() => CashMovement.record('x', otherIncome('2026-09-03', 300, '  '))).toThrow(
      withCode('MOVEMENT_DESCRIPTION_REQUIRED'),
    );
    expect(() => CashMovement.record('x', expense('2026-09-03', 'OTHER_EXPENSE', 80))).toThrow(
      withCode('MOVEMENT_DESCRIPTION_REQUIRED'),
    );
    const row = CashMovement.record('x', expense('2026-09-03', 'OTHER_EXPENSE', 80, '  Focos  '));
    expect(row.details.description).toBe('Focos');
    expect(
      CashMovement.record('y', expense('2026-09-03', 'GARBAGE', 150, ' ')).details.description,
    ).toBeNull();
  });

  it('revises with the same rules', () => {
    const row = CashMovement.record('p1', payment('2026-09-03', 501));
    row.revise({ amount: pesos(1400) });
    expect(row.amount.equals(pesos(1400))).toBe(true);
    expect(() => row.revise({ category: 'GARBAGE' })).toThrow(
      withCode('MOVEMENT_UNIT_NOT_ALLOWED'),
    );
    row.revise({ category: 'GARBAGE', unit: null });
    expect(row.direction).toBe('OUT');
  });

  it('soft-deletes and then refuses changes', () => {
    const row = CashMovement.record('p1', payment('2026-09-03', 501));
    row.remove();
    expect(row.isRemoved).toBe(true);
    expect(() => row.remove()).toThrow(withCode('MOVEMENT_REMOVED'));
    expect(() => row.revise({ amount: pesos(1) })).toThrow(withCode('MOVEMENT_REMOVED'));
    expect(CashMovement.restore('p1', payment('2026-09-03', 501), true).isRemoved).toBe(true);
  });
});
