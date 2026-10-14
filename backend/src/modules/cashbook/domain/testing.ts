import { LocalDate, Money, UnitNumber } from '../../../shared-kernel/index.js';
import type { MovementDetails } from './cash-movement.js';

// Test builders shared by the cashbook specs.

export const d = (text: string) => LocalDate.parse(text);
export const pesos = (amount: number) => Money.ofPesos(amount);

export const payment = (date: string, unit: number, amount = 700): MovementDetails => ({
  date: d(date),
  category: 'UNIT_PAYMENT',
  amount: pesos(amount),
  description: null,
  unit: UnitNumber.of(unit),
  week: null,
});

export const expense = (
  date: string,
  category: 'GARBAGE' | 'CLEANING' | 'OTHER_EXPENSE',
  amount: number,
  description: string | null = null,
): MovementDetails => ({
  date: d(date),
  category,
  amount: pesos(amount),
  description,
  unit: null,
  // A garbage row pays for the week of its date unless a spec says otherwise.
  week: category === 'GARBAGE' ? d(date).startOfWeek() : null,
});

/** A garbage row paid on `date` for the week starting on Monday `week`. */
export const garbage = (date: string, week: string, amount = 150): MovementDetails => ({
  ...expense(date, 'GARBAGE', amount),
  week: d(week),
});

export const otherIncome = (
  date: string,
  amount: number,
  description: string,
): MovementDetails => ({
  date: d(date),
  category: 'OTHER_INCOME',
  amount: pesos(amount),
  description,
  unit: null,
  week: null,
});
