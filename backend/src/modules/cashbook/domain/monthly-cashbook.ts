import {
  ConflictError,
  Money,
  MOVEMENT_CATEGORIES,
  type MovementCategory,
  type MovementDetails,
  NotFoundError,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { CashMovement } from './cash-movement.js';

export interface CashbookTotals {
  readonly income: Money;
  readonly expense: Money;
  /** income − expense */
  readonly net: Money;
  readonly byCategory: Readonly<Record<MovementCategory, Money>>;
}

/**
 * The list of movements of one month: the turn admin's main screen and the source of the
 * monthly report. It is the consistency boundary for its rows: they can be added, revised
 * or removed only while the month is open, and they must stay dated inside the month.
 * Whether the month is open comes from the monthly report.
 */
export class MonthlyCashbook {
  private constructor(
    readonly month: YearMonth,
    readonly isOpen: boolean,
    private readonly rows: CashMovement[],
  ) {}

  static of(
    month: YearMonth,
    isOpen: boolean,
    movements: readonly CashMovement[],
  ): MonthlyCashbook {
    for (const movement of movements) {
      if (!movement.month.equals(month)) {
        throw new ValidationError(
          'MOVEMENT_OUTSIDE_MONTH',
          `Movement ${movement.id} (${movement.date}) does not belong to ${month}`,
        );
      }
    }
    return new MonthlyCashbook(month, isOpen, [...movements]);
  }

  /** Live rows sorted by date; rows on the same date keep the order they were added in. */
  get movements(): readonly CashMovement[] {
    return this.rows
      .filter((row) => !row.isRemoved)
      .map((row, index) => ({ row, index }))
      .sort((a, b) => a.row.date.compareTo(b.row.date) || a.index - b.index)
      .map(({ row }) => row);
  }

  add(id: string, details: MovementDetails): CashMovement {
    this.assertOpen();
    if (this.rows.some((row) => row.id === id)) {
      throw new ConflictError('MOVEMENT_DUPLICATED', `Movement ${id} already exists`);
    }
    this.assertInMonth(details);
    const movement = CashMovement.record(id, details);
    this.rows.push(movement);
    return movement;
  }

  /**
   * Changes a row. Moving it to another month is not a revision: remove it here and add it
   * there, so each month's list and audit trail stay self-contained.
   */
  revise(id: string, changes: Partial<MovementDetails>): CashMovement {
    this.assertOpen();
    const movement = this.find(id);
    if (changes.date) this.assertInMonth({ date: changes.date });
    movement.revise(changes);
    return movement;
  }

  remove(id: string): CashMovement {
    this.assertOpen();
    const movement = this.find(id);
    movement.remove();
    return movement;
  }

  totals(): CashbookTotals {
    return totalsOf(this.movements);
  }

  private find(id: string): CashMovement {
    const movement = this.rows.find((row) => row.id === id);
    if (!movement)
      throw new NotFoundError('MOVEMENT_NOT_FOUND', `No movement ${id} in ${this.month}`);
    return movement;
  }

  private assertOpen(): void {
    if (!this.isOpen) {
      throw new ConflictError(
        'MONTH_CLOSED',
        `${this.month} is closed; only the superadmin can reopen it`,
      );
    }
  }

  private assertInMonth(details: Pick<MovementDetails, 'date'>): void {
    if (!this.month.contains(details.date)) {
      throw new ValidationError(
        'MOVEMENT_OUTSIDE_MONTH',
        `${details.date} is not in ${this.month}; record it in its own month`,
      );
    }
  }
}

/** Live rows added up: income, expense and each category. */
export function totalsOf(rows: readonly CashMovement[]): CashbookTotals {
  const byCategory = Object.fromEntries(
    MOVEMENT_CATEGORIES.map((category) => [category, Money.ZERO]),
  ) as Record<MovementCategory, Money>;
  let income = Money.ZERO;
  let expense = Money.ZERO;
  for (const row of rows) {
    if (row.isRemoved) continue;
    byCategory[row.category] = byCategory[row.category].plus(row.amount);
    if (row.direction === 'IN') income = income.plus(row.amount);
    else expense = expense.plus(row.amount);
  }
  return { income, expense, net: income.minus(expense), byCategory };
}
