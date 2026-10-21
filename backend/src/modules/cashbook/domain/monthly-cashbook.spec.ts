import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { YearMonth } from '../../../shared-kernel/index.js';
import { CashMovement } from './cash-movement.js';
import { MonthlyCashbook } from './monthly-cashbook.js';
import { d, expense, otherIncome, payment, pesos } from './testing.js';

const september = YearMonth.of(2026, 9);
const openBook = () => MonthlyCashbook.of(september, true, []);

describe('MonthlyCashbook', () => {
  it('adds rows and lists them by date, keeping insertion order within a day', () => {
    const book = openBook();
    book.add('a', payment('2026-09-10', 501));
    book.add('b', expense('2026-09-06', 'GARBAGE', 150));
    book.add('c', payment('2026-09-10', 502));
    expect(book.movements.map((row) => row.id)).toEqual(['b', 'a', 'c']);
  });

  it('computes the totals of the month', () => {
    const book = openBook();
    book.add('p1', payment('2026-09-01', 501));
    book.add('p2', payment('2026-09-02', 502, 1400));
    book.add('i1', otherIncome('2026-09-03', 250, 'Reembolso de garrafón'));
    book.add('g1', expense('2026-09-06', 'GARBAGE', 150));
    book.add('c1', expense('2026-09-07', 'CLEANING', 270));
    book.add('c2', expense('2026-09-09', 'CLEANING', 270));
    book.add('o1', expense('2026-09-12', 'OTHER_EXPENSE', 95.5, 'Focos'));

    const totals = book.totals();
    expect(totals.income.toString()).toBe('2350.00');
    expect(totals.expense.toString()).toBe('785.50');
    expect(totals.net.toString()).toBe('1564.50');
    expect(totals.byCategory.CLEANING.toString()).toBe('540.00');
    expect(totals.byCategory.UNIT_PAYMENT.toString()).toBe('2100.00');
  });

  it('has zero totals when empty', () => {
    const totals = openBook().totals();
    expect(totals.net.isZero()).toBe(true);
    expect(Object.values(totals.byCategory).every((amount) => amount.isZero())).toBe(true);
  });

  it('keeps rows inside the month (cash basis)', () => {
    const book = openBook();
    expect(() => book.add('x', payment('2026-10-01', 501))).toThrow(
      withCode('MOVEMENT_OUTSIDE_MONTH'),
    );
    book.add('p1', payment('2026-09-30', 501));
    expect(() => book.revise('p1', { date: d('2026-08-31') })).toThrow(
      withCode('MOVEMENT_OUTSIDE_MONTH'),
    );
    expect(() =>
      MonthlyCashbook.of(september, true, [CashMovement.record('x', payment('2026-08-31', 501))]),
    ).toThrow(withCode('MOVEMENT_OUTSIDE_MONTH'));
  });

  it('revises and removes rows, excluding removed ones from the list and totals', () => {
    const book = openBook();
    book.add('p1', payment('2026-09-01', 501));
    book.add('p2', payment('2026-09-02', 502));
    book.revise('p1', { amount: pesos(1400), date: d('2026-09-05') });
    book.remove('p2');
    expect(book.movements.map((row) => row.id)).toEqual(['p1']);
    expect(book.totals().income.toString()).toBe('1400.00');
  });

  it('rejects unknown and duplicated ids', () => {
    const book = openBook();
    book.add('p1', payment('2026-09-01', 501));
    expect(() => book.add('p1', payment('2026-09-02', 501))).toThrow(
      withCode('MOVEMENT_DUPLICATED'),
    );
    expect(() => book.revise('nope', { amount: pesos(1) })).toThrow(withCode('MOVEMENT_NOT_FOUND'));
    expect(() => book.remove('nope')).toThrow(withCode('MOVEMENT_NOT_FOUND'));
  });

  it('is frozen while the month is closed', () => {
    const row = CashMovement.record('p1', payment('2026-09-01', 501));
    const book = MonthlyCashbook.of(september, false, [row]);
    expect(() => book.add('p2', payment('2026-09-02', 502))).toThrow(withCode('MONTH_CLOSED'));
    expect(() => book.revise('p1', { amount: pesos(1) })).toThrow(withCode('MONTH_CLOSED'));
    expect(() => book.remove('p1')).toThrow(withCode('MONTH_CLOSED'));
    expect(book.totals().income.toString()).toBe('700.00');
  });
});
