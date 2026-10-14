import { Inject, Injectable } from '@nestjs/common';
import { UnitNumber, type YearMonth } from '../../../shared-kernel/index.js';
import {
  AccountStatement,
  type Charge,
  CHARGE_REPOSITORY,
  type ChargeRepository,
  OPENING_CREDIT_REPOSITORY,
  type OpeningCreditRepository,
  openingPayment,
  type UnitPayment,
} from '../domain/index.js';

/**
 * Account statements from the stored charges and the payments the caller supplies (the
 * cashbook's UNIT_PAYMENT rows, which billing does not read itself), plus the adelantos of
 * the initial load. Allocations are always recomputed, never stored.
 */
@Injectable()
export class GetAccountStatements {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: ChargeRepository,
    @Inject(OPENING_CREDIT_REPOSITORY) private readonly credits: OpeningCreditRepository,
  ) {}

  async of(unit: UnitNumber, payments: readonly UnitPayment[]): Promise<AccountStatement> {
    const [charges, opening] = await Promise.all([
      this.charges.findByUnit(unit),
      this.openingPayments(),
    ]);
    return AccountStatement.build(unit, charges, [
      ...opening.filter((payment) => payment.unit === unit),
      ...payments,
    ]);
  }

  /**
   * One statement per depto, in ascending order. With `through`, as they stood when that
   * month ended: its charges and earlier ones, and the payments dated until its last day.
   * That is what a month's report shows, and it does not move when later months change.
   */
  async ofAll(payments: readonly UnitPayment[], through?: YearMonth): Promise<AccountStatement[]> {
    const [all, opening] = await Promise.all([this.charges.findAll(), this.openingPayments()]);
    const charges = all.filter((charge: Charge) => !through || !charge.month.isAfter(through));
    // The opening adelanto is dated before the books start, so it is always included.
    const paid = [...opening, ...payments].filter(
      (payment) => !through || !payment.date.yearMonth.isAfter(through),
    );
    return UnitNumber.all().map((unit) =>
      AccountStatement.build(
        unit,
        charges.filter((charge) => charge.unit === unit),
        paid.filter((payment) => payment.unit === unit),
      ),
    );
  }

  private async openingPayments(): Promise<UnitPayment[]> {
    return (await this.credits.findAll()).map(openingPayment);
  }
}
