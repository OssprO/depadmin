import type { LocalDate } from './local-date.js';

/**
 * Port for "what day is it in the building". The domain never reads the system clock, so
 * time-dependent rules (write windows, suggestions) are tested with a fixed date.
 */
export interface Clock {
  today(): LocalDate;
}
