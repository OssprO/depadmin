import { Inject, Injectable } from '@nestjs/common';
import {
  type LocalDate,
  MONTH_LEDGER,
  type MonthLedger,
  type UnitNumber,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  CASH_MOVEMENT_REPOSITORY,
  type CashMovement,
  type CashMovementRepository,
  cleaningPayoutsOf,
  cleaningSpanOf,
  type GarbageWeek,
  garbageSchedule,
  garbageWeeksOf,
  MonthlyCashbook,
  type WeeklyCleaningPayout,
} from '../domain/index.js';

/** Read access to the cashbook for the reports module (lists, totals, payments, weeks). */
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

  /** The month's garbage weeks: paid, pending (a suggestion) or upcoming. */
  async garbageWeeks(month: YearMonth, today: LocalDate): Promise<GarbageWeek[]> {
    const weeks = garbageWeeksOf(month);
    const rows = await this.movements.findGarbageForWeeks(weeks[0]!, weeks.at(-1)!);
    return garbageSchedule(month, today, rows);
  }

  /** What to pay the cleaning person for each week that touches the month. */
  async cleaningPayouts(month: YearMonth): Promise<WeeklyCleaningPayout[]> {
    const { first, last } = cleaningSpanOf(month);
    return cleaningPayoutsOf(month, await this.movements.findBetween(first, last));
  }

  /** Live payments of one depto, or of all of them. */
  payments(unit?: UnitNumber): Promise<CashMovement[]> {
    return unit ? this.movements.findPaymentsOf(unit) : this.movements.findAllPayments();
  }
}
