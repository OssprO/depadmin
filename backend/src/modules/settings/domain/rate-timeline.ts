import {
  ConflictError,
  type LocalDate,
  type Money,
  NotFoundError,
  ValidationError,
} from '../../../shared-kernel/index.js';

export interface RateChange {
  readonly effectiveFrom: LocalDate;
  readonly amount: Money;
}

/**
 * The history of one rate. A change applies from its date onwards and never rewrites the
 * past, so a month keeps the rates that were in force when it happened.
 */
export class RateTimeline {
  private constructor(private readonly changes: readonly RateChange[]) {}

  static of(changes: readonly RateChange[]): RateTimeline {
    if (changes.length === 0) {
      throw new ValidationError('RATE_INVALID', 'A rate needs at least one value');
    }
    const sorted = [...changes].sort((a, b) => a.effectiveFrom.compareTo(b.effectiveFrom));
    sorted.forEach((change, i) => {
      if (!change.amount.isPositive()) {
        throw new ValidationError('RATE_INVALID', `Rate must be positive, got ${change.amount}`);
      }
      const previous = sorted[i - 1];
      if (previous?.effectiveFrom.equals(change.effectiveFrom)) {
        throw new ValidationError('RATE_INVALID', `Two values from ${change.effectiveFrom}`);
      }
    });
    return new RateTimeline(sorted);
  }

  get history(): readonly RateChange[] {
    return this.changes;
  }

  amountOn(date: LocalDate): Money {
    const change = this.changes.findLast((c) => !c.effectiveFrom.isAfter(date));
    if (!change) {
      throw new NotFoundError('RATE_NOT_DEFINED', `No rate in force on ${date}`);
    }
    return change.amount;
  }

  /** Adds a change after the latest one; past values are history and stay as they are. */
  withChange(change: RateChange): RateTimeline {
    const latest = this.changes.at(-1);
    if (latest && !change.effectiveFrom.isAfter(latest.effectiveFrom)) {
      throw new ConflictError(
        'RATE_CHANGE_NOT_LATEST',
        `A change from ${change.effectiveFrom} must come after ${latest.effectiveFrom}`,
      );
    }
    return RateTimeline.of([...this.changes, change]);
  }

  /**
   * Adds a value from before the first one, for months that had no rate in force yet (the
   * building's history). It changes nothing a month already used.
   */
  withEarlier(change: RateChange): RateTimeline {
    const first = this.changes[0];
    if (first && !change.effectiveFrom.isBefore(first.effectiveFrom)) {
      throw new ConflictError(
        'RATE_CHANGE_NOT_EARLIER',
        `A value from ${change.effectiveFrom} must come before ${first.effectiveFrom}`,
      );
    }
    return RateTimeline.of([change, ...this.changes]);
  }
}
