// In-memory adapter for specs that need the rates. Excluded from the build.
import { LocalDate } from '../../../shared-kernel/index.js';
import { RateSettings, type RateSettingsRepository } from '../domain/index.js';
import { GetRates } from './get-rates.js';

export class InMemoryRateSettingsRepository implements RateSettingsRepository {
  constructor(private settings: RateSettings | null = null) {}

  load(): Promise<RateSettings | null> {
    return Promise.resolve(this.settings);
  }

  save(settings: RateSettings): Promise<void> {
    this.settings = settings;
    return Promise.resolve();
  }
}

/** The rates query over the initial rates, in force since August 2026. */
export function initialRates(): GetRates {
  return new GetRates(
    new InMemoryRateSettingsRepository(RateSettings.startingOn(LocalDate.of(2026, 8, 1))),
  );
}
