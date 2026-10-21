import {
  ConflictError,
  type UnitNumber,
  ValidationError,
  type YearMonth,
  type YearMonthRange,
} from '../../../shared-kernel/index.js';

/**
 * Why another depto covers the shift:
 * - `SKIPPED_SHIFT`: the scheduled depto chose not to take it; it pays the skip penalty for
 *   every delegated month, whoever covers (the outgoing administrator or another depto).
 * - `INACTIVE_UNIT`: the scheduled depto is inactive, so the superadmin assigns a cover.
 * - `OTHER`: any other agreed handover.
 */
export type DelegationReason = 'SKIPPED_SHIFT' | 'INACTIVE_UNIT' | 'OTHER';

export interface ShiftDelegationProps {
  readonly id: string;
  readonly months: YearMonthRange;
  readonly originalUnit: UnitNumber;
  readonly delegateUnit: UnitNumber;
  readonly reason: DelegationReason;
  readonly cancelled?: boolean;
}

/**
 * A manual handover of (part of) a shift period, assigned by the superadmin. It overrides the
 * computed calendar only for its months. Cancelling keeps the record for the audit trail.
 */
export class ShiftDelegation {
  private constructor(
    readonly id: string,
    readonly months: YearMonthRange,
    readonly originalUnit: UnitNumber,
    readonly delegateUnit: UnitNumber,
    readonly reason: DelegationReason,
    private cancelled: boolean,
  ) {}

  static create(props: ShiftDelegationProps): ShiftDelegation {
    if (props.months.isOpenEnded) {
      throw new ValidationError('DELEGATION_INVALID', 'A delegation needs an end month');
    }
    if (props.originalUnit === props.delegateUnit) {
      throw new ValidationError('DELEGATION_INVALID', 'A depto cannot delegate to itself');
    }
    return new ShiftDelegation(
      props.id,
      props.months,
      props.originalUnit,
      props.delegateUnit,
      props.reason,
      props.cancelled ?? false,
    );
  }

  get isActive(): boolean {
    return !this.cancelled;
  }

  covers(month: YearMonth): boolean {
    return this.isActive && this.months.contains(month);
  }

  cancel(): void {
    if (this.cancelled) {
      throw new ConflictError(
        'DELEGATION_ALREADY_CANCELLED',
        `Delegation ${this.id} is already cancelled`,
      );
    }
    this.cancelled = true;
  }
}
