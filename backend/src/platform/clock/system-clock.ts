import { type Clock, Instant, LocalDate } from '../../shared-kernel/index.js';

/** The building is in Mexico City: "today" changes at its midnight, not at UTC's. */
export const BUILDING_TIME_ZONE = 'America/Mexico_City';

export class SystemClock implements Clock {
  // en-CA formats dates as YYYY-MM-DD.
  private readonly dateFormat: Intl.DateTimeFormat;

  constructor(
    timeZone: string = BUILDING_TIME_ZONE,
    private readonly currentMillis: () => number = Date.now,
  ) {
    this.dateFormat = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  now(): Instant {
    return Instant.ofEpochMillis(this.currentMillis());
  }

  today(): LocalDate {
    return LocalDate.parse(this.dateFormat.format(this.currentMillis()));
  }
}
