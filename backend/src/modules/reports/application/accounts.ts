import { Injectable } from '@nestjs/common';
import type { UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import {
  type AccountStatement,
  GetAccountStatements,
  type UnitPayment,
} from '../../billing/application/index.js';
import { type CashMovement, ReadCashbook } from '../../cashbook/application/index.js';

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
 */
@Injectable()
export class GetAccounts {
  constructor(
    private readonly statements: GetAccountStatements,
    private readonly cashbook: ReadCashbook,
  ) {}

  async of(unit: UnitNumber): Promise<AccountStatement> {
    const payments = await this.cashbook.payments(unit);
    return this.statements.of(unit, payments.map(toUnitPayment));
  }

  /** Every depto's account now, or as it stood when `through` ended (for its report). */
  async all(through?: YearMonth): Promise<AccountStatement[]> {
    const payments = await this.cashbook.payments();
    return this.statements.ofAll(payments.map(toUnitPayment), through);
  }
}
