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
} from '../../../shared-kernel/index.js';
import { type Unit, UNIT_REPOSITORY, type UnitRepository } from '../domain/index.js';
import { UNIT_AUDIT, UnitAuditAction } from './unit-audit.js';

/** The superadmin sets (or clears) the owner's name that the monthly report shows. */
@Injectable()
export class RenameUnitOwner {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(UNIT_REPOSITORY) private readonly units: UnitRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(actor: Actor, number: UnitNumber, ownerName: string | null): Promise<Unit> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const unit = await this.units.findByNumber(number);
      if (!unit) throw new NotFoundError('UNIT_NOT_FOUND', `There is no depto ${number}`);
      const tracked = trackChanges(UNIT_AUDIT, unit);
      unit.renameOwner(ownerName);
      const change = tracked.change(UnitAuditAction.OWNER_RENAMED);
      if (change.changes.length === 0) return unit;

      await this.units.save(unit);
      await this.audit.record(actor, change);
      return unit;
    });
  }
}
