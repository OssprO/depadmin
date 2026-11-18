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

  it('keeps the agreement of a change and deletes the changes taken back', async () => {
    const initial = RateSettings.startingOn(d('2026-08-01'));
    const agreement = { on: d('2026-11-10'), summary: 'Asamblea de noviembre' };
    const scheduled = initial.change('maintenanceFee', {
      effectiveFrom: d('2027-01-01'),
      amount: Money.ofPesos(800),
      agreement,
    });
    await repository().save(scheduled);
    expect((await repository().load())!.historyOf('maintenanceFee').at(-1)?.agreement).toEqual(
      agreement,
    );
    expect((await repository().load())!.historyOf('cleaningPerVisit')[0]?.agreement).toBeNull();

    await repository().save(scheduled.withdraw('maintenanceFee', d('2027-01-01')));
    expect(await ctx.database.client.rateChange.count()).toBe(4);
  });

  it('refuses an agreement without its date', async () => {
    await repository().save(RateSettings.startingOn(d('2026-08-01')));
    await expect(
      ctx.database.client.rateChange.updateMany({ data: { agreement: 'sin fecha' } }),
    ).rejects.toThrow(/rate_change_agreement_complete/);
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
