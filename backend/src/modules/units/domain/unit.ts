import {
  ConflictError,
  UnitNumber,
  ValidationError,
  type YearMonth,
  YearMonthRange,
} from '../../../shared-kernel/index.js';

/**
 * A depto. Its history of inactive periods matters: whether a depto was active in a past
 * month decides that month's charges and shift coverage, so a single boolean is not enough.
 * Status changes take effect for whole months.
 */
export class Unit {
  private constructor(
    readonly number: UnitNumber,
    private periods: YearMonthRange[],
  ) {}

  static create(number: UnitNumber): Unit {
    return new Unit(number, []);
  }

  /** Rebuilds a unit from storage, checking the history is consistent. */
  static restore(number: UnitNumber, inactivePeriods: readonly YearMonthRange[]): Unit {
    const periods = [...inactivePeriods].sort((a, b) => a.from.compareTo(b.from));
    periods.forEach((period, i) => {
      const next = periods[i + 1];
      if (next && period.overlaps(next)) {
        throw new ValidationError(
          'UNIT_HISTORY_INVALID',
          `Depto ${number}: inactive periods ${period} and ${next} overlap`,
        );
      }
    });
    return new Unit(number, periods);
  }

  get inactivePeriods(): readonly YearMonthRange[] {
    return this.periods;
  }

  isActiveIn(month: YearMonth): boolean {
    return !this.periods.some((period) => period.contains(month));
  }

  /** Inactive from `from` until reactivated. */
  deactivate(from: YearMonth): void {
    const clash = this.periods.find((period) => period.overlaps(YearMonthRange.startingAt(from)));
    if (clash) {
      throw new ConflictError(
        'UNIT_ALREADY_INACTIVE',
        `Depto ${this.number} is already inactive in ${clash} (requested from ${from})`,
      );
    }
    this.periods = [...this.periods, YearMonthRange.startingAt(from)];
  }

  /**
   * Active again from `from`. Closes the open inactive period the month before; if that
   * period had not started yet, it is dropped altogether.
   */
  reactivate(from: YearMonth): void {
    const open = this.periods.find((period) => period.isOpenEnded);
    if (!open || open.from.isAfter(from)) {
      throw new ConflictError(
        'UNIT_NOT_INACTIVE',
        `Depto ${this.number} has no inactive period to end at ${from}`,
      );
    }
    const rest = this.periods.filter((period) => period !== open);
    this.periods = open.from.equals(from) ? rest : [...rest, open.endingAt(from.previous())];
  }
}
