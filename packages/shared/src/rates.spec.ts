import { describe, expect, it } from 'vitest';
import { rateChangeParamsSchema, rateChangeRequestSchema } from './rates.js';

describe('rate contracts', () => {
  const valid = {
    rate: 'maintenanceFee',
    from: '2027-01',
    amount: 80_000,
    agreedOn: '2026-11-10',
    agreement: '  Asamblea ordinaria: la cuota sube a $800  ',
  };

  it('takes a change with the agreement behind it, trimmed', () => {
    expect(rateChangeRequestSchema.parse(valid).agreement).toBe(
      'Asamblea ordinaria: la cuota sube a $800',
    );
  });

  it('refuses a change without an agreement, a zero amount or an unknown rate', () => {
    expect(rateChangeRequestSchema.safeParse({ ...valid, agreement: '  ' }).success).toBe(false);
    expect(rateChangeRequestSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(rateChangeRequestSchema.safeParse({ ...valid, rate: 'water' }).success).toBe(false);
    expect(
      rateChangeRequestSchema.safeParse({ ...valid, agreement: 'x'.repeat(301) }).success,
    ).toBe(false);
  });

  it('names a change by its rate and month', () => {
    expect(
      rateChangeParamsSchema.safeParse({ rate: 'garbageWeekly', from: '2027-01' }).success,
    ).toBe(true);
    expect(
      rateChangeParamsSchema.safeParse({ rate: 'garbageWeekly', from: '2027-1' }).success,
    ).toBe(false);
  });
});
