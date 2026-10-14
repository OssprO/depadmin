import { Inject, Injectable } from '@nestjs/common';
import { UnitNumber } from '../../../shared-kernel/index.js';
import {
  AccountStatement,
  type Charge,
  CHARGE_REPOSITORY,
  type ChargeRepository,
  type UnitPayment,
} from '../domain/index.js';

/**
 * Account statements from the stored charges and the payments the caller supplies (the
 * cashbook's UNIT_PAYMENT rows, which billing does not read itself). Allocations are always
 * recomputed, never stored.
 */
@Injectable()
export class GetAccountStatements {
  constructor(@Inject(CHARGE_REPOSITORY) private readonly charges: ChargeRepository) {}

  async of(unit: UnitNumber, payments: readonly UnitPayment[]): Promise<AccountStatement> {
    return AccountStatement.build(unit, await this.charges.findByUnit(unit), payments);
  }

  /** One statement per depto, in ascending order. */
  async ofAll(payments: readonly UnitPayment[]): Promise<AccountStatement[]> {
    const charges = await this.charges.findAll();
    return UnitNumber.all().map((unit) =>
      AccountStatement.build(
        unit,
        charges.filter((charge: Charge) => charge.unit === unit),
        payments.filter((payment) => payment.unit === unit),
      ),
    );
  }
}
