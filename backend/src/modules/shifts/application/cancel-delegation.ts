import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
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
import { LoadShiftCalendar } from './shift-calendar.js';

/**
 * Cancels a delegation: the scheduled depto answers for those months again and the skip
 * penalties are taken back. The delegation stays on record, cancelled. A delegation that
 * covers a closed month stays as it is until that month is reopened.
 *
 * - The outgoing administrator takes back their own handover (one that starts the period
 *   after theirs), while they can still record it (ADR-0031).
 * - The superadmin, as an auxiliary, any delegation.
 */
@Injectable()
export class CancelDelegation {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(SHIFT_DELEGATION_REPOSITORY) private readonly delegations: ShiftDelegationRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MONTH_LEDGER) private readonly ledger: MonthLedger,
    private readonly calendars: LoadShiftCalendar,
    private readonly penalties: WithdrawShiftSkipPenalties,
  ) {}

  async execute(actor: Actor, delegationId: string): Promise<ShiftDelegation> {
    return this.unitOfWork.run(async () => {
      const delegation = await this.delegations.findById(delegationId);
      if (!delegation) {
        throw new NotFoundError('DELEGATION_NOT_FOUND', `There is no delegation ${delegationId}`);
      }
      if (actor.role !== 'SUPERADMIN') {
        const calendar = await this.calendars.execute(delegation.months.from);
        calendar.scheduler.assertIsHandover(delegation);
        this.policy.assertCanHandOver({
          actor,
          firstMonth: delegation.months.from,
          today: this.clock.today(),
          responsibility: calendar,
        });
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
