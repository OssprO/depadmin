import {
  ConflictError,
  type LocalDate,
  type Money,
  type MovementDetails,
  signedAmountOf,
  validateMovement,
  type YearMonth,
} from '../../../shared-kernel/index.js';

/**
 * A row of a past month, as the paper lists it. It follows the same rules as a live cash
 * row, but it has no write window and no audit, and removing it deletes it: while the
 * history is in review it is a transcription being corrected, not a record of the books.
 */
export class HistoricalMovement {
  private constructor(
    readonly id: string,
    private current: MovementDetails,
  ) {}

  static record(id: string, details: MovementDetails): HistoricalMovement {
    return new HistoricalMovement(id, validateMovement(details));
  }

  get details(): MovementDetails {
    return this.current;
  }

  get date(): LocalDate {
    return this.current.date;
  }

  get month(): YearMonth {
    return this.current.date.yearMonth;
  }

  get signedAmount(): Money {
    return signedAmountOf(this.current);
  }

  revise(details: MovementDetails): void {
    this.current = validateMovement(details);
  }
}

/** Each week's garbage was paid once, as in the live books. */
export function assertWeekUnpaid(
  movement: HistoricalMovement,
  garbageRows: readonly HistoricalMovement[],
): void {
  const { week } = movement.details;
  if (!week) return;
  const other = garbageRows.find((row) => row.id !== movement.id && row.details.week?.equals(week));
  if (other) {
    throw new ConflictError(
      'GARBAGE_WEEK_PAID',
      `The week of ${week} is already paid by movement ${other.id} (${other.date})`,
    );
  }
}
