import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_TRAIL,
  type AuditTrail,
  type ChangeAuthor,
  creationOf,
  UNIT_OF_WORK,
  type UnitOfWork,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { GetRates } from '../../settings/application/index.js';
import { ListUnits, UnitStatuses } from '../../units/application/index.js';
import {
  type Charge,
  CHARGE_REPOSITORY,
  type ChargeRepository,
  missingMaintenanceFees,
} from '../domain/index.js';
import { CHARGE_AUDIT, ChargeAuditAction } from './charge-audit.js';

/**
 * Charges the month's fee to every depto active that month, at the fee in force. Idempotent:
 * deptos already charged are skipped, so opening a month twice never charges twice. Called
 * by the reports module when a month is opened, inside its unit of work, by a user or by the
 * daily job that opens the month when nobody did.
 */
@Injectable()
export class ChargeMaintenanceFees {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: ChargeRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    private readonly rates: GetRates,
    private readonly units: ListUnits,
  ) {}

  async execute(author: ChangeAuthor, month: YearMonth): Promise<Charge[]> {
    const [{ maintenanceFee }, units] = await Promise.all([
      this.rates.forMonth(month),
      this.units.execute(),
    ]);
    return this.unitOfWork.run(async () => {
      const fees = missingMaintenanceFees(
        month,
        new UnitStatuses(units).activeIn(month),
        maintenanceFee,
        await this.charges.findByMonth(month),
      );
      await this.charges.save(fees);
      for (const fee of fees) {
        await this.audit.record(author, creationOf(CHARGE_AUDIT, ChargeAuditAction.ADDED, fee));
      }
      return fees;
    });
  }
}
