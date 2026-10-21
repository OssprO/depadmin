import { describe, expect, it } from 'vitest';
import { cleaningVisitsRequestSchema, isoDayOfWeek, movementRequestSchema } from './books.js';

const row = {
  date: '2026-10-03',
  category: 'UNIT_PAYMENT',
  amount: 70000,
  unit: 501,
  description: null,
  week: null,
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
    expect(issues({ category: 'GARBAGE', week: '2026-09-28' })).toEqual(['unit']);
    expect(issues({ category: 'OTHER_INCOME', unit: null, description: ' ' })).toEqual([
      'description',
    ]);
    expect(issues({ amount: 0 })).toEqual(['amount']);
    expect(issues({ amount: 10.5 })).toEqual(['amount']);
  });

  it('names the week of a garbage row by its Monday, and only there', () => {
    const issues = (body: object) =>
      movementRequestSchema
        .safeParse({ ...row, unit: null, ...body })
        .error?.issues.map((i) => i.message);
    expect(issues({ category: 'GARBAGE', week: '2026-09-28' })).toBeUndefined();
    expect(issues({ category: 'GARBAGE' })).toEqual(['Elige la semana que se paga']);
    expect(issues({ category: 'GARBAGE', week: '2026-10-04' })).toEqual([
      'La semana empieza en lunes',
    ]);
    expect(issues({ category: 'CLEANING', week: '2026-09-28' })).toEqual([
      'Este tipo no lleva semana',
    ]);
  });

  it('knows the day of the week regardless of the time zone', () => {
    expect(['2026-09-28', '2026-10-03', '2026-10-04'].map(isoDayOfWeek)).toEqual([1, 6, 7]);
  });

  it('marks each cleaning visit once', () => {
    const visits = (dates: string[]) =>
      cleaningVisitsRequestSchema.safeParse({ dates, amount: 27000 }).success;
    expect(visits(['2026-10-05', '2026-10-07'])).toBe(true);
    expect(visits([])).toBe(false);
    expect(visits(['2026-10-05', '2026-10-05'])).toBe(false);
  });
});
