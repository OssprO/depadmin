import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, Money, YearMonth } from '../../../shared-kernel/index.js';
import { RateSettings } from '../domain/index.js';
import { GetRates } from './get-rates.js';
import { InMemoryRateSettingsRepository } from './testing.js';

describe('GetRates', () => {
  it('returns the rates in force on the first day of the month', async () => {
    const settings = RateSettings.startingOn(LocalDate.of(2026, 8, 1)).change('shiftSkipPenalty', {
      effectiveFrom: LocalDate.of(2027, 1, 15),
      amount: Money.ofPesos(600),
    });
    const rates = new GetRates(new InMemoryRateSettingsRepository(settings));

    expect((await rates.forMonth(YearMonth.of(2027, 1))).shiftSkipPenalty).toEqual(
      Money.ofPesos(500),
    );
    expect((await rates.forMonth(YearMonth.of(2027, 2))).shiftSkipPenalty).toEqual(
      Money.ofPesos(600),
    );
  });

  it('fails clearly before the rates are configured', async () => {
    await expect(
      new GetRates(new InMemoryRateSettingsRepository()).forMonth(YearMonth.of(2026, 10)),
    ).rejects.toThrow(withCode('RATES_NOT_CONFIGURED'));
  });
});
