import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { LocalDate, Money } from '../../../shared-kernel/index.js';
import { RateSettings } from './rate-settings.js';
import { RateTimeline } from './rate-timeline.js';

const d = (text: string) => LocalDate.parse(text);
const pesos = (amount: number) => Money.ofPesos(amount);

describe('RateTimeline', () => {
  const fee = RateTimeline.of([
    { effectiveFrom: d('2027-01-01'), amount: pesos(800) },
    { effectiveFrom: d('2026-01-01'), amount: pesos(700) },
  ]);

  it('returns the value in force on each date', () => {
    expect(fee.amountOn(d('2026-12-31')).equals(pesos(700))).toBe(true);
    expect(fee.amountOn(d('2027-01-01')).equals(pesos(800))).toBe(true);
    expect(fee.amountOn(d('2030-06-15')).equals(pesos(800))).toBe(true);
  });

  it('has no value before its first change', () => {
    expect(() => fee.amountOn(d('2025-12-31'))).toThrow(withCode('RATE_NOT_DEFINED'));
  });

  it('only appends changes after the latest one', () => {
    const later = fee.withChange({ effectiveFrom: d('2028-01-01'), amount: pesos(900) });
    expect(later.history.map((c) => c.amount.toString())).toEqual(['700.00', '800.00', '900.00']);
    expect(fee.history).toHaveLength(2); // immutable
    expect(() => fee.withChange({ effectiveFrom: d('2027-01-01'), amount: pesos(1) })).toThrow(
      withCode('RATE_CHANGE_NOT_LATEST'),
    );
  });

  it('rejects empty, duplicated or non-positive histories', () => {
    expect(() => RateTimeline.of([])).toThrow(withCode('RATE_INVALID'));
    expect(() =>
      RateTimeline.of([
        { effectiveFrom: d('2026-01-01'), amount: pesos(1) },
        { effectiveFrom: d('2026-01-01'), amount: pesos(2) },
      ]),
    ).toThrow(withCode('RATE_INVALID'));
    expect(() => RateTimeline.of([{ effectiveFrom: d('2026-01-01'), amount: Money.ZERO }])).toThrow(
      withCode('RATE_INVALID'),
    );
  });
});

describe('RateSettings', () => {
  const settings = RateSettings.startingOn(d('2026-08-01'));

  it('starts with the rates of the current reports', () => {
    const rates = settings.ratesOn(d('2026-08-15'));
    expect(Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, v.toString()]))).toEqual({
      maintenanceFee: '700.00',
      cleaningPerVisit: '270.00',
      garbageWeekly: '150.00',
      shiftSkipPenalty: '500.00',
    });
  });

  it('changes one rate from a date without touching the past or the others', () => {
    const updated = settings.change('cleaningPerVisit', {
      effectiveFrom: d('2027-01-01'),
      amount: pesos(300),
    });
    expect(updated.ratesOn(d('2026-12-31')).cleaningPerVisit.equals(pesos(270))).toBe(true);
    expect(updated.ratesOn(d('2027-01-01')).cleaningPerVisit.equals(pesos(300))).toBe(true);
    expect(updated.ratesOn(d('2027-01-01')).maintenanceFee.equals(pesos(700))).toBe(true);
    expect(settings.ratesOn(d('2027-01-01')).cleaningPerVisit.equals(pesos(270))).toBe(true);
  });

  it('accepts overrides and restores from stored history', () => {
    const custom = RateSettings.startingOn(d('2026-08-01'), { garbageWeekly: pesos(160) });
    expect(custom.ratesOn(d('2026-08-01')).garbageWeekly.equals(pesos(160))).toBe(true);

    const restored = RateSettings.restore({
      maintenanceFee: settings.historyOf('maintenanceFee'),
      cleaningPerVisit: settings.historyOf('cleaningPerVisit'),
      garbageWeekly: [{ effectiveFrom: d('2026-08-01'), amount: pesos(175) }],
      shiftSkipPenalty: settings.historyOf('shiftSkipPenalty'),
    });
    expect(restored.ratesOn(d('2026-09-01')).garbageWeekly.equals(pesos(175))).toBe(true);
  });
});
