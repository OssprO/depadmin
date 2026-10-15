import { UnitNumber, ValidationError, YearMonth } from '../../../shared-kernel/index.js';

/** Fixed order in which deptos take the shift (spec 4.2). */
export const ROTATION_ORDER: readonly UnitNumber[] = [
  501, 502, 401, 402, 301, 302, 201, 202, 101, 102,
].map((n) => UnitNumber.of(n));

export const MONTHS_PER_SHIFT = 2;

/** A known point of the rotation; every other month is computed from it. */
export interface ShiftAnchor {
  readonly month: YearMonth;
  readonly unit: UnitNumber;
}

/**
 * August and September 2026 belong to depto 501 (spec 4.5). The rotation begins there: the
 * administration roster before it was another, and the paper does not say who held each
 * month, so the months before have no shift (ADR-0023).
 */
export const DEFAULT_ANCHOR: ShiftAnchor = {
  month: YearMonth.of(2026, 8),
  unit: UnitNumber.of(501),
};

/** The months a depto is scheduled to hold the shift, before delegations. */
export interface ShiftPeriod {
  readonly start: YearMonth;
  readonly end: YearMonth;
  readonly unit: UnitNumber;
}

/**
 * The base calendar: pure modular arithmetic over months. It ignores inactive deptos and
 * delegations on purpose; those are exceptions applied on top by `ShiftScheduler`, so the
 * calendar of everyone else never shifts.
 */
export class ShiftRotation {
  private readonly anchorPosition: number;

  constructor(
    private readonly anchor: ShiftAnchor = DEFAULT_ANCHOR,
    private readonly order: readonly UnitNumber[] = ROTATION_ORDER,
    private readonly monthsPerShift: number = MONTHS_PER_SHIFT,
  ) {
    if (new Set(order).size !== order.length || order.length === 0) {
      throw new ValidationError('ROTATION_INVALID', 'Rotation order must list distinct deptos');
    }
    if (!Number.isInteger(monthsPerShift) || monthsPerShift < 1) {
      throw new ValidationError('ROTATION_INVALID', `Invalid shift length ${monthsPerShift}`);
    }
    this.anchorPosition = order.indexOf(anchor.unit);
    if (this.anchorPosition < 0) {
      throw new ValidationError(
        'ROTATION_INVALID',
        `Anchor depto ${anchor.unit} is not in the rotation`,
      );
    }
  }

  /** The first month of the rotation; earlier months belong to nobody. */
  get firstMonth(): YearMonth {
    return this.anchor.month;
  }

  periodFor(month: YearMonth): ShiftPeriod {
    const shiftsFromAnchor = Math.floor(this.anchor.month.monthsUntil(month) / this.monthsPerShift);
    const start = this.anchor.month.plus(shiftsFromAnchor * this.monthsPerShift);
    const position = mod(this.anchorPosition + shiftsFromAnchor, this.order.length);
    return {
      start,
      end: start.plus(this.monthsPerShift - 1),
      unit: this.order[position] as UnitNumber,
    };
  }
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
