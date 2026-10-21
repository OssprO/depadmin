import {
  CATEGORY_RULES,
  ConflictError,
  type Direction,
  type LocalDate,
  type Money,
  type MovementCategory,
  type MovementDetails,
  signedAmountOf,
  validateMovement,
  type YearMonth,
} from '../../../shared-kernel/index.js';

/**
 * One row of the cashbook: an income or an expense on a date (cash basis: the date decides
 * the month). Removing a row is a soft delete, so the audit trail keeps what it was.
 */
export class CashMovement {
  private constructor(
    readonly id: string,
    private current: MovementDetails,
    private removed: boolean,
  ) {}

  static record(id: string, details: MovementDetails): CashMovement {
    return new CashMovement(id, validateMovement(details), false);
  }

  static restore(id: string, details: MovementDetails, removed: boolean): CashMovement {
    return new CashMovement(id, validateMovement(details), removed);
  }

  get details(): MovementDetails {
    return this.current;
  }

  get date(): LocalDate {
    return this.current.date;
  }

  get month(): YearMonth {
    return this.current.date.yearMonth;
  }

  get category(): MovementCategory {
    return this.current.category;
  }

  get amount(): Money {
    return this.current.amount;
  }

  get direction(): Direction {
    return CATEGORY_RULES[this.current.category].direction;
  }

  /** The amount with its sign for the balance: income adds, expenses subtract. */
  get signedAmount(): Money {
    return signedAmountOf(this.current);
  }

  get isRemoved(): boolean {
    return this.removed;
  }

  revise(changes: Partial<MovementDetails>): void {
    this.assertNotRemoved();
    this.current = validateMovement({ ...this.current, ...changes });
  }

  remove(): void {
    this.assertNotRemoved();
    this.removed = true;
  }

  private assertNotRemoved(): void {
    if (this.removed) {
      throw new ConflictError('MOVEMENT_REMOVED', `Movement ${this.id} was removed`);
    }
  }
}
