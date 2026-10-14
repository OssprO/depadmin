import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  creationOf,
  removalOf,
  UNIT_OF_WORK,
  type UnitNumber,
  type UnitOfWork,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { GetRates } from '../../settings/application/index.js';
import {
  type Charge,
  CHARGE_REPOSITORY,
  type ChargeRepository,
  shiftSkipPenalties,
} from '../domain/index.js';
import { CHARGE_AUDIT, ChargeAuditAction } from './charge-audit.js';

/**
 * Charges the skip penalty for each month a depto did not take its shift, at the rate in
 * force that month. Called by the shifts module when a skipped shift is delegated, inside
 * its unit of work. Not exposed over HTTP.
 */
@Injectable()
export class ChargeShiftSkipPenalties {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: ChargeRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    private readonly rates: GetRates,
  ) {}

  async execute(actor: Actor, unit: UnitNumber, months: readonly YearMonth[]): Promise<void> {
    const penalties: Charge[] = [];
    for (const month of months) {
      const { shiftSkipPenalty } = await this.rates.forMonth(month);
      penalties.push(...shiftSkipPenalties(unit, [month], () => shiftSkipPenalty));
    }

    await this.unitOfWork.run(async () => {
      await this.charges.save(penalties);
      for (const penalty of penalties) {
        await this.audit.record(actor, creationOf(CHARGE_AUDIT, ChargeAuditAction.ADDED, penalty));
      }
    });
  }
}

/** Takes back the skip penalties of those months, e.g. when the delegation is cancelled. */
@Injectable()
export class WithdrawShiftSkipPenalties {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: ChargeRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(actor: Actor, unit: UnitNumber, months: readonly YearMonth[]): Promise<void> {
    await this.unitOfWork.run(async () => {
      const penalties = (await this.charges.findByUnit(unit)).filter(
        (charge) =>
          charge.type === 'SHIFT_SKIP_PENALTY' &&
          months.some((month) => month.equals(charge.month)),
      );
      await this.charges.remove(penalties);
      for (const penalty of penalties) {
        await this.audit.record(actor, removalOf(CHARGE_AUDIT, ChargeAuditAction.REMOVED, penalty));
      }
    });
  }
}
