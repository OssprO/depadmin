import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  MONTH_LEDGER,
  type MonthLedger,
  NotFoundError,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
  WriteAccessPolicy,
} from '../../../shared-kernel/index.js';
import { WithdrawShiftSkipPenalties } from '../../billing/application/index.js';
import {
  SHIFT_DELEGATION_REPOSITORY,
  type ShiftDelegation,
  type ShiftDelegationRepository,
} from '../domain/index.js';
import { assertNoneClosed } from './closed-months.js';
import { DELEGATION_AUDIT, DelegationAuditAction } from './shift-audit.js';

/**
 * The superadmin cancels a delegation: the scheduled depto answers for those months again
 * and the skip penalties are taken back. The delegation stays on record, cancelled. A
 * delegation that covers a closed month stays as it is until that month is reopened.
 */
@Injectable()
export class CancelDelegation {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(SHIFT_DELEGATION_REPOSITORY) private readonly delegations: ShiftDelegationRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(MONTH_LEDGER) private readonly ledger: MonthLedger,
    private readonly penalties: WithdrawShiftSkipPenalties,
  ) {}

  async execute(actor: Actor, delegationId: string): Promise<ShiftDelegation> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      const delegation = await this.delegations.findById(delegationId);
      if (!delegation) {
        throw new NotFoundError('DELEGATION_NOT_FOUND', `There is no delegation ${delegationId}`);
      }
      const { from, to } = delegation.months;
      await assertNoneClosed(this.ledger, from.through(to ?? from));
      const tracked = trackChanges(DELEGATION_AUDIT, delegation);
      delegation.cancel();

      await this.delegations.save(delegation);
      await this.audit.record(actor, tracked.change(DelegationAuditAction.CANCELLED));
      if (delegation.reason === 'SKIPPED_SHIFT') {
        await this.penalties.execute(actor, delegation.originalUnit, from.through(to ?? from));
      }
      return delegation;
    });
  }
}
