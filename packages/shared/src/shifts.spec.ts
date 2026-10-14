import { describe, expect, it } from 'vitest';
import { createDelegationRequestSchema, shiftCalendarQuerySchema } from './shifts.js';
import { setUnitStatusRequestSchema, unitNumberSchema } from './units.js';

describe('shift and unit contracts', () => {
  it('accepts only real deptos and well-formed months', () => {
    expect(unitNumberSchema.safeParse(501).success).toBe(true);
    expect(unitNumberSchema.safeParse(503).success).toBe(false);
    expect(shiftCalendarQuerySchema.safeParse({ from: '2026-08', to: '2027-07' }).success).toBe(
      true,
    );
    expect(shiftCalendarQuerySchema.safeParse({ from: '2026-13', to: '2027-07' }).success).toBe(
      false,
    );
    expect(setUnitStatusRequestSchema.safeParse({ active: false, from: '2026-8' }).success).toBe(
      false,
    );
  });

  it('rejects a delegation that ends before it starts, on the last month', () => {
    const result = createDelegationRequestSchema.safeParse({
      from: '2026-11',
      to: '2026-10',
      delegateUnit: 501,
      reason: 'SKIPPED_SHIFT',
    });

    expect(result.error?.issues[0]?.path).toEqual(['to']);
  });
});
