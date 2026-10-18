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
  assertWeekUnpaid,
  CASH_MOVEMENT_REPOSITORY,
  type CashMovement,
  type CashMovementRepository,
  MonthlyCashbook,
} from '../domain/index.js';

/**
 * The checks every change to a month's rows shares, in one place: the actor may write the
 * month (the superadmin, or its responsible owner within the write window), and the month
 * has been opened, held open until the write commits so a close cannot slip in between.
 * Closed months are refused by `MonthlyCashbook` itself. Rules that reach
 * beyond one month (a garbage week paid from another month) are checked here too.
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
    await this.ledger.holdOpen(month);
    const status = await this.ledger.statusOf(month);
    if (status === 'NOT_OPENED') {
      throw new ConflictError('MONTH_NOT_OPENED', `Open ${month} before recording in it`);
    }
    return MonthlyCashbook.of(month, status === 'OPEN', await this.movements.findByMonth(month));
  }

  /**
   * Whether the month is of the building's history, before the cut-over. Its rows are a
   * transcription of its paper, checked by closing the month, and the audit log starts at
   * the cut-over, so changes to them are not audited (ADR-0023).
   */
  async isHistory(month: YearMonth): Promise<boolean> {
    const cutover = await this.ledger.cutover();
    return cutover !== null && month.isBefore(cutover);
  }

  /**
   * Before saving a row: the garbage week it pays for is not paid by another row. The week
   * is held until the write commits, so two requests paying it cannot both pass.
   */
  async assertConsistent(movement: CashMovement): Promise<void> {
    const { week } = movement.details;
    if (!week) return;
    await this.movements.holdWeek(week);
    assertWeekUnpaid(movement, await this.movements.findGarbageForWeeks(week, week));
  }
}
