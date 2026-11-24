import {
  ConflictError,
  type LocalDate,
  type Money,
  NotFoundError,
  ValidationError,
} from '../../../shared-kernel/index.js';

/** The longest summary of the agreement behind a change. */
export const RATE_AGREEMENT_MAX_LENGTH = 300;

/**
 * Where a change was decided: the building votes its rates (ADR-0031). Until the app holds
 * the vote (phase 27), the shift administrator records the assembly that agreed it.
 */
export interface RateAgreement {
  readonly on: LocalDate;
  readonly summary: string;
}

export function rateAgreement(on: LocalDate, summary: string): RateAgreement {
  const text = summary.trim();
  if (text.length === 0 || text.length > RATE_AGREEMENT_MAX_LENGTH) {
    throw new ValidationError(
      'RATE_AGREEMENT_INVALID',
      `Describe the agreement in 1 to ${RATE_AGREEMENT_MAX_LENGTH} characters`,
    );
  }
  return { on, summary: text };
}

export interface RateChange {
  readonly effectiveFrom: LocalDate;
  readonly amount: Money;
  /** Null for the values the platform started with and those of the building's history. */
  readonly agreement?: RateAgreement | null;
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
   * Takes back a change that was scheduled by mistake. The first value stays: the months
   * before any other change are charged with it.
   */
  withoutChange(effectiveFrom: LocalDate): RateTimeline {
    const index = this.changes.findIndex((change) => change.effectiveFrom.equals(effectiveFrom));
    if (index < 0) {
      throw new NotFoundError('RATE_CHANGE_NOT_FOUND', `No change from ${effectiveFrom}`);
    }
    if (index === 0) {
      throw new ConflictError(
        'RATE_CHANGE_FIRST',
        'The first value of a rate cannot be taken back',
      );
    }
    return RateTimeline.of(this.changes.filter((_, i) => i !== index));
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
