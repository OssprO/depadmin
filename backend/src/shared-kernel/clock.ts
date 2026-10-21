import type { Instant } from './instant.js';
import type { LocalDate } from './local-date.js';

/**
 * Port for "what day is it in the building" and "what time is it now". The domain never
 * reads the system clock, so time-dependent rules (write windows, session expiry) are tested
 * with a fixed time.
 */
export interface Clock {
  /** The building's local date. */
  today(): LocalDate;
  now(): Instant;
}

export const CLOCK = Symbol('Clock');
