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
});

export const expense = (
  date: string,
  category: 'GARBAGE' | 'CLEANING' | 'OTHER_EXPENSE',
  amount: number,
  description: string | null = null,
): MovementDetails => ({ date: d(date), category, amount: pesos(amount), description, unit: null });

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
});
