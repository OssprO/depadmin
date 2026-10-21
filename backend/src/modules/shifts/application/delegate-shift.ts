import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  creationOf,
  MONTH_LEDGER,
  type MonthLedger,
  UNIT_OF_WORK,
  type UnitNumber,
  type UnitOfWork,
  ValidationError,
  WriteAccessPolicy,
  type YearMonth,
  YearMonthRange,
} from '../../../shared-kernel/index.js';
import { ChargeShiftSkipPenalties } from '../../billing/application/index.js';
import {
  type DelegationReason,
  SHIFT_DELEGATION_REPOSITORY,
  ShiftDelegation,
  type ShiftDelegationRepository,
} from '../domain/index.js';
import { assertNoneClosed } from './closed-months.js';
import { DELEGATION_AUDIT, DelegationAuditAction } from './shift-audit.js';
import { LoadShiftCalendar } from './shift-calendar.js';

export interface DelegateShiftCommand {
  readonly from: YearMonth;
  readonly to: YearMonth;
  readonly delegateUnit: UnitNumber;
  readonly reason: DelegationReason;
}

/**
 * Hands (part of) a shift period to another depto. The depto it is taken from is always the
 * scheduled one, so it is not part of the command.
 *
 * - The superadmin can delegate any period, for any reason.
 * - An owner records the handover after their shift: the next depto skips its period, which
 *   the outgoing depto or another one covers. Only while the owner can still act on the
 *   month before (their shift plus the grace days).
 *
 * A skipped shift charges the skipped depto the penalty for each delegated month, in the
 * same transaction. Closed months cannot be delegated.
 */
@Injectable()
export class DelegateShift {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(SHIFT_DELEGATION_REPOSITORY) private readonly delegations: ShiftDelegationRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MONTH_LEDGER) private readonly ledger: MonthLedger,
    private readonly calendars: LoadShiftCalendar,
    private readonly penalties: ChargeShiftSkipPenalties,
  ) {}

  async execute(actor: Actor, command: DelegateShiftCommand): Promise<ShiftDelegation> {
    const { from, to } = command;
    if (from.isAfter(to)) {
      throw new ValidationError('DELEGATION_INVALID', `The range ${from}..${to} is reversed`);
    }

    return this.unitOfWork.run(async () => {
      const calendar = await this.calendars.execute(from, to);
      const delegation = ShiftDelegation.create({
        id: randomUUID(),
        months: YearMonthRange.between(from, to),
        originalUnit: calendar.assignmentFor(from).scheduledUnit,
        delegateUnit: command.delegateUnit,
        reason: command.reason,
      });
      if (actor.role === 'OWNER') {
        // The shape first: "a handover starts a period" says more than "not your month".
        calendar.scheduler.assertIsHandover(delegation);
        this.policy.assertCanHandOver({
          actor,
          firstMonth: from,
          today: this.clock.today(),
          responsibility: calendar,
        });
      }
      calendar.scheduler.assertCanDelegate(delegation, calendar.delegations, calendar.units);
      await assertNoneClosed(this.ledger, from.through(to));

      await this.delegations.save(delegation);
      await this.audit.record(
        actor,
        creationOf(DELEGATION_AUDIT, DelegationAuditAction.CREATED, delegation),
      );
      if (delegation.reason === 'SKIPPED_SHIFT') {
        await this.penalties.execute(actor, delegation.originalUnit, from.through(to));
      }
      return delegation;
    });
  }
}
