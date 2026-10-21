import { Inject, Injectable } from '@nestjs/common';
import { LocalDate, type UnitNumber, type YearMonth } from '../../../shared-kernel/index.js';
import {
  type AccountStatement,
  GetAccountStatements,
  type UnitPayment,
} from '../../billing/application/index.js';
import { type CashMovement, ReadCashbook } from '../../cashbook/application/index.js';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/index.js';

/** A cashbook payment row as billing sees it (UNIT_PAYMENT rows always name a depto). */
export function toUnitPayment(movement: CashMovement): UnitPayment {
  return {
    id: movement.id,
    unit: movement.details.unit as UnitNumber,
    date: movement.date,
    amount: movement.amount,
  };
}

/**
 * Account statements: billing's charges against the cashbook's payments. Everyone may read
 * every depto's account, as the monthly report already shows them.
 *
 * The accounts start at the cut-over. A payment of the history settled what its paper says
 * and is not counted again: what each depto owed or had paid ahead then is the initial
 * load, dated before the cut-over (ADR-0023).
 */
@Injectable()
export class GetAccounts {
  constructor(
    private readonly statements: GetAccountStatements,
    private readonly cashbook: ReadCashbook,
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
  ) {}

  async of(unit: UnitNumber): Promise<AccountStatement> {
    const payments = await this.livePayments(unit);
    return this.statements.of(unit, payments);
  }

  /** Every depto's account now, or as it stood when `through` ended (for its report). */
  async all(through?: YearMonth): Promise<AccountStatement[]> {
    return this.statements.ofAll(await this.livePayments(), through);
  }

  private async livePayments(unit?: UnitNumber) {
    const [payments, ledger] = await Promise.all([
      this.cashbook.payments(unit),
      this.reports.loadLedger(),
    ]);
    const cutover = ledger && LocalDate.firstOf(ledger.start.cutover);
    return payments
      .filter((payment) => !cutover || !payment.date.isBefore(cutover))
      .map(toUnitPayment);
  }
}
