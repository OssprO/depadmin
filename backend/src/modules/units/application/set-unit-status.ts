import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  NotFoundError,
  trackChanges,
  UNIT_OF_WORK,
  type UnitNumber,
  type UnitOfWork,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { type Unit, UNIT_REPOSITORY, type UnitRepository } from '../domain/index.js';
import { UNIT_AUDIT, UnitAuditAction } from './unit-audit.js';

export interface SetUnitStatusCommand {
  readonly unit: UnitNumber;
  /** Inactive (false) or active again (true), for whole months starting at `from`. */
  readonly active: boolean;
  readonly from: YearMonth;
}

/**
 * The superadmin marks a depto inactive (nobody lives there or it has no owner) or active
 * again. The shift calendar does not move: an inactive depto's period waits for a cover the
 * superadmin assigns with a delegation.
 */
@Injectable()
export class SetUnitStatus {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(UNIT_REPOSITORY) private readonly units: UnitRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(actor: Actor, command: SetUnitStatusCommand): Promise<Unit> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const unit = await this.units.findByNumber(command.unit);
      if (!unit) throw new NotFoundError('UNIT_NOT_FOUND', `There is no depto ${command.unit}`);
      const tracked = trackChanges(UNIT_AUDIT, unit);
      if (command.active) unit.reactivate(command.from);
      else unit.deactivate(command.from);

      await this.units.save(unit);
      const action = command.active ? UnitAuditAction.REACTIVATED : UnitAuditAction.DEACTIVATED;
      await this.audit.record(actor, tracked.change(action));
      return unit;
    });
  }
}
