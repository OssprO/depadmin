import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/support/database.js';
import { LocalDate, Money } from '../../../shared-kernel/index.js';
import { RateSettings } from '../domain/index.js';
import { PrismaRateSettingsRepository } from './prisma-rate-settings.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaRateSettingsRepository(ctx.database);
const d = (text: string) => LocalDate.parse(text);

describe('PrismaRateSettingsRepository', () => {
  it('has no settings until they are configured', async () => {
    expect(await repository().load()).toBeNull();
  });

  it('round-trips every rate with its history', async () => {
    const settings = RateSettings.startingOn(d('2026-08-01')).change('cleaningPerVisit', {
      effectiveFrom: d('2027-01-01'),
      amount: Money.ofPesos(300),
    });
    await repository().save(settings);

    const loaded = await repository().load();
    expect(loaded!.ratesOn(d('2026-12-31')).cleaningPerVisit.toString()).toBe('270.00');
    expect(loaded!.ratesOn(d('2027-01-01')).cleaningPerVisit.toString()).toBe('300.00');
    expect(loaded!.ratesOn(d('2027-01-01')).maintenanceFee.toString()).toBe('700.00');
    expect(loaded!.historyOf('garbageWeekly')).toHaveLength(1);
  });

  it('appends new changes on later saves', async () => {
    const initial = RateSettings.startingOn(d('2026-08-01'));
    await repository().save(initial);
    await repository().save(
      initial.change('maintenanceFee', {
        effectiveFrom: d('2027-01-01'),
        amount: Money.ofPesos(750),
      }),
    );
    expect(await ctx.database.client.rateChange.count()).toBe(5);
  });
});
