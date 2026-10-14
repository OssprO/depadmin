import type { LocalDate, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import type { CashMovement } from './cash-movement.js';

export interface CashMovementRepository {
  findById(id: string): Promise<CashMovement | null>;
  /** Every row dated in the month, removed ones included (the cashbook filters them). */
  findByMonth(month: YearMonth): Promise<CashMovement[]>;
  /** Every row dated between both days (inclusive), removed ones included. */
  findBetween(first: LocalDate, last: LocalDate): Promise<CashMovement[]>;
  /** Live GARBAGE rows paying for a week between both Mondays, wherever they are dated. */
  findGarbageForWeeks(first: LocalDate, last: LocalDate): Promise<CashMovement[]>;
  /** Live UNIT_PAYMENT rows of a depto across all months, for its account statement. */
  findPaymentsOf(unit: UnitNumber): Promise<CashMovement[]>;
  /** Live UNIT_PAYMENT rows of every depto, for the table of balances. */
  findAllPayments(): Promise<CashMovement[]>;
  save(movements: readonly CashMovement[]): Promise<void>;
}

export const CASH_MOVEMENT_REPOSITORY = Symbol('CashMovementRepository');
