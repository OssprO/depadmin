import {
  ConflictError,
  type LocalDate,
  type Money,
  type UnitNumber,
  ValidationError,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { CATEGORY_RULES, type Direction, type MovementCategory } from './movement-category.js';

export interface MovementDetails {
  readonly date: LocalDate;
  readonly category: MovementCategory;
  /** Always positive; the category gives the direction. */
  readonly amount: Money;
  readonly description: string | null;
  readonly unit: UnitNumber | null;
}

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
    return new CashMovement(id, validate(details), false);
  }

  static restore(id: string, details: MovementDetails, removed: boolean): CashMovement {
    return new CashMovement(id, validate(details), removed);
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
    return this.direction === 'IN' ? this.current.amount : this.current.amount.negate();
  }

  get isRemoved(): boolean {
    return this.removed;
  }

  revise(changes: Partial<MovementDetails>): void {
    this.assertNotRemoved();
    this.current = validate({ ...this.current, ...changes });
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

function validate(details: MovementDetails): MovementDetails {
  const rule = CATEGORY_RULES[details.category];
  const description = details.description?.trim() || null;

  if (!details.amount.isPositive()) {
    throw new ValidationError(
      'MOVEMENT_AMOUNT_INVALID',
      `Amount must be positive, got ${details.amount}`,
    );
  }
  if (rule.requiresUnit && !details.unit) {
    throw new ValidationError('MOVEMENT_UNIT_REQUIRED', `${details.category} needs a depto`);
  }
  if (!rule.requiresUnit && details.unit) {
    throw new ValidationError(
      'MOVEMENT_UNIT_NOT_ALLOWED',
      `${details.category} cannot name a depto`,
    );
  }
  if (rule.requiresDescription && !description) {
    throw new ValidationError(
      'MOVEMENT_DESCRIPTION_REQUIRED',
      `${details.category} needs a description`,
    );
  }
  return { ...details, description };
}
