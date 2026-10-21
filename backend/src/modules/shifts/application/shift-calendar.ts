import { Inject, Injectable } from '@nestjs/common';
import type { ShiftResponsibility, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { ListUnits, UnitStatuses } from '../../units/application/index.js';
import {
  SHIFT_DELEGATION_REPOSITORY,
  type ShiftAssignment,
  type ShiftDelegation,
  type ShiftDelegationRepository,
  ShiftRotation,
  ShiftScheduler,
} from '../domain/index.js';

/** Months loaded past the requested range, so a write window can be followed to its end. */
const LOOKAHEAD_MONTHS = 24;

/**
 * The shift calendar with the delegations and depto statuses of a range of months loaded.
 * It is also how other modules learn who answers for a month (`ShiftResponsibility`), which
 * `WriteAccessPolicy` needs.
 */
export class ShiftCalendar implements ShiftResponsibility {
  constructor(
    readonly scheduler: ShiftScheduler,
    readonly delegations: readonly ShiftDelegation[],
    readonly units: UnitStatuses,
  ) {}

  assignmentFor(month: YearMonth): ShiftAssignment {
    return this.scheduler.assignmentFor(month, this.delegations, this.units);
  }

  isResponsible(unit: UnitNumber, month: YearMonth): boolean {
    return this.assignmentFor(month).responsibleUnits.includes(unit);
  }
}

@Injectable()
export class LoadShiftCalendar {
  private readonly scheduler = new ShiftScheduler(new ShiftRotation());

  constructor(
    @Inject(SHIFT_DELEGATION_REPOSITORY) private readonly delegations: ShiftDelegationRepository,
    private readonly units: ListUnits,
  ) {}

  /** Loads what is needed to answer for `from`..`to` (and the months that follow). */
  async execute(from: YearMonth, to: YearMonth = from): Promise<ShiftCalendar> {
    const [delegations, units] = await Promise.all([
      this.delegations.findOverlapping(from.previous(), to.plus(LOOKAHEAD_MONTHS)),
      this.units.execute(),
    ]);
    return new ShiftCalendar(this.scheduler, delegations, new UnitStatuses(units));
  }
}
