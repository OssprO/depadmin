import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, Money, YearMonth } from '../../../shared-kernel/index.js';
import { RateSettings } from '../domain/index.js';
import { FakeUnitOfWork } from '../../../../test/support/audit-trail.js';
import { admin, owner } from '../../shifts/application/testing.js';
import { RecordEarlierRates } from './earlier-rates.js';
import { GetRates } from './get-rates.js';
import { initialRateSettings, InMemoryRateSettingsRepository } from './testing.js';

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

describe('RecordEarlierRates', () => {
  const pesos = (amount: number) => Money.ofPesos(amount);
  const d = (text: string) => LocalDate.parse(text);

  it('adds the rates of the history before the configured ones', async () => {
    const settings = initialRateSettings();
    const record = new RecordEarlierRates(settings, new FakeUnitOfWork());
    await record.execute(admin, [
      { rate: 'maintenanceFee', effectiveFrom: d('2022-05-01'), amount: pesos(600) },
      { rate: 'maintenanceFee', effectiveFrom: d('2023-02-11'), amount: pesos(700) },
    ]);
    const fee = (await settings.load())!.historyOf('maintenanceFee');
    expect(fee.map((change) => [String(change.effectiveFrom), change.amount.toString()])).toEqual([
      ['2022-05-01', '600.00'],
      ['2023-02-11', '700.00'],
      ['2026-08-01', '700.00'],
    ]);
  });

  it('is for the superadmin, once the rates are configured, and never rewrites them', async () => {
    const early = [
      { rate: 'garbageWeekly' as const, effectiveFrom: d('2022-05-01'), amount: pesos(150) },
    ];
    const record = (settings: InMemoryRateSettingsRepository) =>
      new RecordEarlierRates(settings, new FakeUnitOfWork());
    await expect(record(initialRateSettings()).execute(owner(501), early)).rejects.toThrow(
      withCode('SUPERADMIN_ONLY'),
    );
    await expect(
      record(new InMemoryRateSettingsRepository()).execute(admin, early),
    ).rejects.toThrow(withCode('RATES_NOT_CONFIGURED'));
    const late = [{ ...early[0]!, effectiveFrom: d('2026-08-01') }];
    await expect(record(initialRateSettings()).execute(admin, late)).rejects.toThrow(
      withCode('RATE_CHANGE_NOT_EARLIER'),
    );
  });
});
