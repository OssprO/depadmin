import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  ConflictError,
  type LocalDate,
  type Money,
  UNIT_OF_WORK,
  type UnitOfWork,
  WriteAccessPolicy,
} from '../../../shared-kernel/index.js';
import {
  RATE_SETTINGS_REPOSITORY,
  type RateName,
  type RateSettingsRepository,
} from '../domain/index.js';

export interface EarlierRate {
  readonly rate: RateName;
  readonly effectiveFrom: LocalDate;
  readonly amount: Money;
}

/**
 * The rates in force before the configured ones, from the building's history (ADR-0023):
 * they only prefill the forms of its months, which charge no fees. Each comes before every
 * value of its rate, so nothing a month already used changes. Called by the history import
 * inside its unit of work; like the rest of the history, it is not audited.
 */
@Injectable()
export class RecordEarlierRates {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(RATE_SETTINGS_REPOSITORY) private readonly settings: RateSettingsRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(actor: Actor, rates: readonly EarlierRate[]): Promise<void> {
    this.policy.assertCanAdminister(actor);
    return this.unitOfWork.run(async () => {
      let settings = await this.settings.load();
      if (!settings) {
        throw new ConflictError('RATES_NOT_CONFIGURED', 'The rates have not been configured');
      }
      // Latest first: each one goes before the ones already in place.
      const latestFirst = [...rates].sort((a, b) => b.effectiveFrom.compareTo(a.effectiveFrom));
      for (const { rate, effectiveFrom, amount } of latestFirst) {
        settings = settings.withEarlier(rate, { effectiveFrom, amount });
      }
      await this.settings.save(settings);
    });
  }
}
