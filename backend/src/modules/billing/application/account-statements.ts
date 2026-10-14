import { Inject, Injectable } from '@nestjs/common';
import { UnitNumber, type YearMonth } from '../../../shared-kernel/index.js';
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

  /**
   * One statement per depto, in ascending order. With `through`, as they stood when that
   * month ended: its charges and earlier ones, and the payments dated until its last day.
   * That is what a month's report shows, and it does not move when later months change.
   */
  async ofAll(payments: readonly UnitPayment[], through?: YearMonth): Promise<AccountStatement[]> {
    const charges = (await this.charges.findAll()).filter(
      (charge: Charge) => !through || !charge.month.isAfter(through),
    );
    const paid = payments.filter((payment) => !through || !payment.date.yearMonth.isAfter(through));
    return UnitNumber.all().map((unit) =>
      AccountStatement.build(
        unit,
        charges.filter((charge) => charge.unit === unit),
        paid.filter((payment) => payment.unit === unit),
      ),
    );
  }
}
