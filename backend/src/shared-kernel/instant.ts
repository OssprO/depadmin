import { civilFromEpochDay } from './calendar.js';
import { ValidationError } from './domain-error.js';

const MS_PER_SECOND = 1_000;
const MS_PER_DAY = 86_400_000;

/**
 * A point on the timeline, in milliseconds since 1970-01-01T00:00:00Z. Business rules reason
 * in `LocalDate`; an `Instant` is for things that expire at an exact moment, such as sessions.
 * Like the rest of the kernel it avoids `Date`, so it means the same on any host.
 */
export class Instant {
  private constructor(readonly epochMillis: number) {}

  static ofEpochMillis(epochMillis: number): Instant {
    if (!Number.isSafeInteger(epochMillis)) {
      throw new ValidationError('INSTANT_INVALID', `Invalid epoch milliseconds ${epochMillis}`);
    }
    return new Instant(epochMillis);
  }

  plusSeconds(seconds: number): Instant {
    return Instant.ofEpochMillis(this.epochMillis + seconds * MS_PER_SECOND);
  }

  plusDays(days: number): Instant {
    return Instant.ofEpochMillis(this.epochMillis + days * MS_PER_DAY);
  }

  isBefore(other: Instant): boolean {
    return this.epochMillis < other.epochMillis;
  }

  isAfter(other: Instant): boolean {
    return this.epochMillis > other.epochMillis;
  }

  equals(other: Instant): boolean {
    return this.epochMillis === other.epochMillis;
  }

  /** ISO 8601 in UTC, e.g. `2026-10-13T03:53:55.000Z`. */
  toString(): string {
    const epochDay = Math.floor(this.epochMillis / MS_PER_DAY);
    const msOfDay = this.epochMillis - epochDay * MS_PER_DAY;
    const { year, month, day } = civilFromEpochDay(epochDay);
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    const time = [
      pad(Math.floor(msOfDay / 3_600_000)),
      pad(Math.floor(msOfDay / 60_000) % 60),
      pad(Math.floor(msOfDay / MS_PER_SECOND) % 60),
    ].join(':');
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${time}.${pad(msOfDay % MS_PER_SECOND, 3)}Z`;
  }

  toJSON(): string {
    return this.toString();
  }
}
