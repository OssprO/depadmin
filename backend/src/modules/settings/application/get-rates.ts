import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, LocalDate, type YearMonth } from '../../../shared-kernel/index.js';
import {
  RATE_SETTINGS_REPOSITORY,
  type Rates,
  type RateSettingsRepository,
} from '../domain/index.js';

/** The rates in force for a month: those effective on its first day. */
@Injectable()
export class GetRates {
  constructor(
    @Inject(RATE_SETTINGS_REPOSITORY) private readonly settings: RateSettingsRepository,
  ) {}

  async forMonth(month: YearMonth): Promise<Rates> {
    const settings = await this.settings.load();
    if (!settings) {
      throw new ConflictError('RATES_NOT_CONFIGURED', 'The rates have not been configured');
    }
    return settings.ratesOn(LocalDate.firstOf(month));
  }
}
