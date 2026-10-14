import { Inject, Injectable } from '@nestjs/common';
import {
  MONTH_LEDGER,
  type MonthLedger,
  type UnitNumber,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  CASH_MOVEMENT_REPOSITORY,
  type CashMovement,
  type CashMovementRepository,
  MonthlyCashbook,
} from '../domain/index.js';

/** Read access to the cashbook for the reports module (lists, totals, payments). */
@Injectable()
export class ReadCashbook {
  constructor(
    @Inject(CASH_MOVEMENT_REPOSITORY) private readonly movements: CashMovementRepository,
    @Inject(MONTH_LEDGER) private readonly ledger: MonthLedger,
  ) {}

  /** A month's live rows and totals. */
  async month(month: YearMonth): Promise<MonthlyCashbook> {
    const [status, rows] = await Promise.all([
      this.ledger.statusOf(month),
      this.movements.findByMonth(month),
    ]);
    return MonthlyCashbook.of(month, status === 'OPEN', rows);
  }

  /** Live payments of one depto, or of all of them. */
  payments(unit?: UnitNumber): Promise<CashMovement[]> {
    return unit ? this.movements.findPaymentsOf(unit) : this.movements.findAllPayments();
  }
}
