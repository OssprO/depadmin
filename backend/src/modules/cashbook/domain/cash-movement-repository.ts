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
  /**
   * Holds a garbage week until the unit of work ends: another one about to pay it waits
   * here, and then finds it paid. Racing payments of a week are settled one at a time.
   */
  holdWeek(week: LocalDate): Promise<void>;
  /** Live UNIT_PAYMENT rows of a depto across all months, for its account statement. */
  findPaymentsOf(unit: UnitNumber): Promise<CashMovement[]>;
  /** Live UNIT_PAYMENT rows of every depto, for the table of balances. */
  findAllPayments(): Promise<CashMovement[]>;
  save(movements: readonly CashMovement[]): Promise<void>;
  /** New rows in bulk, in the order given (rows on the same date keep it). */
  insert(movements: readonly CashMovement[]): Promise<void>;
}

export const CASH_MOVEMENT_REPOSITORY = Symbol('CashMovementRepository');
