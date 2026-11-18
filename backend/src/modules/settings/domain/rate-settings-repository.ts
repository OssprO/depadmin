import type { RateSettings } from './rate-settings.js';

export interface RateSettingsRepository {
  /**
   * `null` until the rates are first configured. Inside a unit of work it waits for a
   * change being made meanwhile (`lock`), so a month that opens charges the rates in force.
   */
  load(): Promise<RateSettings | null>;
  /** Stores the history as it is now: the values added, and those taken back. */
  save(settings: RateSettings): Promise<void>;
  /**
   * Keeps every other unit of work from reading the rates until this one ends. A change
   * takes it before checking that its month has not opened, so an opening that races it
   * either finishes first (and the change sees the month open) or charges the new rate.
   */
  lock(): Promise<void>;
}

export const RATE_SETTINGS_REPOSITORY = Symbol('RateSettingsRepository');
