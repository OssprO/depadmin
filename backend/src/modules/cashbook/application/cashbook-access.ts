import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  CLOCK,
  type Clock,
  ConflictError,
  MONTH_LEDGER,
  type MonthLedger,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { LoadShiftCalendar } from '../../shifts/application/index.js';
import {
  CASH_MOVEMENT_REPOSITORY,
  type CashMovementRepository,
  MonthlyCashbook,
} from '../domain/index.js';

/**
 * The checks every change to a month's rows shares, in one place: the actor may write the
 * month (the superadmin, or its responsible owner within the write window), and the month
 * has been opened. Closed months are refused by `MonthlyCashbook` itself.
 */
@Injectable()
export class CashbookAccess {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(CASH_MOVEMENT_REPOSITORY) private readonly movements: CashMovementRepository,
    @Inject(MONTH_LEDGER) private readonly ledger: MonthLedger,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly calendars: LoadShiftCalendar,
  ) {}

  async forWriting(actor: Actor, month: YearMonth): Promise<MonthlyCashbook> {
    this.policy.assertCanWrite({
      actor,
      month,
      today: this.clock.today(),
      responsibility: await this.calendars.execute(month),
    });
    const status = await this.ledger.statusOf(month);
    if (status === 'NOT_OPENED') {
      throw new ConflictError('MONTH_NOT_OPENED', `Open ${month} before recording in it`);
    }
    return MonthlyCashbook.of(month, status === 'OPEN', await this.movements.findByMonth(month));
  }
}
