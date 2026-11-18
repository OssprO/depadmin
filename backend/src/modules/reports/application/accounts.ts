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

  /**
   * The depto's account right after one of its payments: the charges through the payment's
   * month against its payments up to that one, in the order they are applied (date, then
   * id, as `allocatePayments` does). Later months do not change it.
   */
  async afterPayment(payment: CashMovement): Promise<AccountStatement> {
    const unit = payment.details.unit as UnitNumber;
    const upToIt = (await this.livePayments(unit)).filter(
      (p) =>
        p.date.isBefore(payment.date) ||
        (p.date.equals(payment.date) && p.id.localeCompare(payment.id) <= 0),
    );
    const statements = await this.statements.ofAll(upToIt, payment.month);
    return statements.find((statement) => statement.unit === unit)!;
  }

  /** The depto's live payments (with their folios), all or through the end of a month. */
  async paymentsOf(unit: UnitNumber, through?: YearMonth): Promise<CashMovement[]> {
    const [payments, cutover] = await Promise.all([
      this.cashbook.payments(unit),
      this.cutoverDay(),
    ]);
    return payments.filter(
      (payment) =>
        (!cutover || !payment.date.isBefore(cutover)) &&
        (!through || !payment.month.isAfter(through)),
    );
  }

  private async cutoverDay(): Promise<LocalDate | null> {
    const ledger = await this.reports.loadLedger();
    return ledger && LocalDate.firstOf(ledger.start.cutover);
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
