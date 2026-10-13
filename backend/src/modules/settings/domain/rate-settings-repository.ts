import type { RateSettings } from './rate-settings.js';

export interface RateSettingsRepository {
  /** `null` until the rates are first configured. */
  load(): Promise<RateSettings | null>;
  /** Stores changes not saved yet; history is append-only, so nothing else changes. */
  save(settings: RateSettings): Promise<void>;
}

export const RATE_SETTINGS_REPOSITORY = Symbol('RateSettingsRepository');
