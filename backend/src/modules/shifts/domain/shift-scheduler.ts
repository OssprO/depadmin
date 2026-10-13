import {
  ConflictError,
  type UnitNumber,
  ValidationError,
  type YearMonth,
  YearMonthRange,
} from '../../../shared-kernel/index.js';
import type { ShiftDelegation } from './shift-delegation.js';
import type { ShiftPeriod, ShiftRotation } from './shift-rotation.js';

/**
 * Port: whether a depto is active in a month. The shifts domain does not know the `units`
 * module; the application layer answers this from it.
 */
export interface UnitAvailability {
  isActive(unit: UnitNumber, month: YearMonth): boolean;
}

/** Who answers for a month once delegations and inactive deptos are applied. */
export interface ShiftAssignment {
  readonly month: YearMonth;
  readonly period: ShiftPeriod;
  readonly scheduledUnit: UnitNumber;
  readonly scheduledUnitActive: boolean;
  readonly delegation: ShiftDelegation | null;
  /**
   * Deptos whose owners can write the month (the superadmin always can). Empty when the
   * scheduled depto is inactive and nobody has been assigned to cover it yet.
   */
  readonly responsibleUnits: readonly UnitNumber[];
}

export class ShiftScheduler {
  constructor(private readonly rotation: ShiftRotation) {}

  assignmentFor(
    month: YearMonth,
    delegations: readonly ShiftDelegation[],
    availability: UnitAvailability,
  ): ShiftAssignment {
    const period = this.rotation.periodFor(month);
    const scheduledUnitActive = availability.isActive(period.unit, month);
    const covering = delegations.filter((d) => d.covers(month));
    if (covering.length > 1) {
      throw new ConflictError('DELEGATIONS_OVERLAP', `More than one delegation covers ${month}`);
    }
    const delegation = covering[0] ?? null;

    // Both the original and the delegate can write a delegated month (spec 2), but only
    // while they are active.
    const candidates = delegation ? [period.unit, delegation.delegateUnit] : [period.unit];
    const responsibleUnits = candidates.filter((unit) => availability.isActive(unit, month));

    return {
      month,
      period,
      scheduledUnit: period.unit,
      scheduledUnitActive,
      delegation,
      responsibleUnits,
    };
  }

  /** Assignments for every month from `from` to `to`, both included. */
  calendar(
    from: YearMonth,
    to: YearMonth,
    delegations: readonly ShiftDelegation[],
    availability: UnitAvailability,
  ): ShiftAssignment[] {
    return from.through(to).map((month) => this.assignmentFor(month, delegations, availability));
  }

  /**
   * Rules for a new delegation: it stays within one scheduled period, starts from the
   * scheduled depto, goes to a depto active in all its months, does not overlap another
   * active delegation, and its reason matches the scheduled depto's status.
   */
  assertCanDelegate(
    candidate: ShiftDelegation,
    existing: readonly ShiftDelegation[],
    availability: UnitAvailability,
  ): void {
    const { months } = candidate;
    const period = this.rotation.periodFor(months.from);
    if (!YearMonthRange.between(period.start, period.end).encloses(months)) {
      throw new ValidationError(
        'DELEGATION_INVALID',
        `Delegation ${months} must stay within the shift period ${period.start}..${period.end}`,
      );
    }
    if (candidate.originalUnit !== period.unit) {
      throw new ValidationError(
        'DELEGATION_INVALID',
        `${months.from} belongs to depto ${period.unit}, not ${candidate.originalUnit}`,
      );
    }

    const allMonths = months.from.through(months.to ?? months.from);
    if (allMonths.some((month) => !availability.isActive(candidate.delegateUnit, month))) {
      throw new ConflictError(
        'DELEGATE_INACTIVE',
        `Depto ${candidate.delegateUnit} is inactive during ${months}`,
      );
    }
    const originalInactive = allMonths.some(
      (month) => !availability.isActive(candidate.originalUnit, month),
    );
    if (candidate.reason === 'SKIPPED_SHIFT' && originalInactive) {
      throw new ValidationError(
        'DELEGATION_INVALID',
        `Depto ${candidate.originalUnit} is inactive, so it cannot skip its shift (and owes no penalty)`,
      );
    }
    if (candidate.reason === 'INACTIVE_UNIT' && !originalInactive) {
      throw new ValidationError(
        'DELEGATION_INVALID',
        `Depto ${candidate.originalUnit} is active during ${months}`,
      );
    }

    const clash = existing.find(
      (d) => d.isActive && d.id !== candidate.id && d.months.overlaps(months),
    );
    if (clash) {
      throw new ConflictError(
        'DELEGATIONS_OVERLAP',
        `Delegation ${clash.id} already covers part of ${months}`,
      );
    }
  }
}
