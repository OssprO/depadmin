import { describe, expect, it } from 'vitest';
import { movementRequestSchema } from './books.js';

const row = {
  date: '2026-10-03',
  category: 'UNIT_PAYMENT',
  amount: 70000,
  unit: 501,
  description: null,
} as const;

describe('book contracts', () => {
  it('accepts a payment with its depto and trims descriptions', () => {
    expect(movementRequestSchema.parse(row)).toEqual(row);
    expect(
      movementRequestSchema.parse({
        ...row,
        category: 'OTHER_EXPENSE',
        unit: null,
        description: '  Foco del pasillo ',
      }).description,
    ).toBe('Foco del pasillo');
  });

  it('applies each category’s rules on the right field', () => {
    const issues = (body: object) =>
      movementRequestSchema.safeParse({ ...row, ...body }).error?.issues.map((i) => i.path[0]);

    expect(issues({ unit: null })).toEqual(['unit']);
    expect(issues({ category: 'GARBAGE' })).toEqual(['unit']);
    expect(issues({ category: 'OTHER_INCOME', unit: null, description: ' ' })).toEqual([
      'description',
    ]);
    expect(issues({ amount: 0 })).toEqual(['amount']);
    expect(issues({ amount: 10.5 })).toEqual(['amount']);
  });
});
