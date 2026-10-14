import { type Clock, Instant, LocalDate } from '../../src/shared-kernel/index.js';

/** A clock for specs that only moves when told to. */
export class FixedClock implements Clock {
  constructor(public instant = Instant.ofEpochMillis(Date.parse('2026-10-13T12:00:00Z'))) {}

  /** Midday in the building (18:00 UTC) of `date`, so the UTC and local dates agree. */
  static on(date: string): FixedClock {
    return new FixedClock(Instant.ofEpochMillis(Date.parse(`${date}T18:00:00Z`)));
  }

  today(): LocalDate {
    return LocalDate.parse(this.instant.toString().slice(0, 10));
  }

  now(): Instant {
    return this.instant;
  }

  advanceDays(days: number): void {
    this.instant = this.instant.plusDays(days);
  }
}
