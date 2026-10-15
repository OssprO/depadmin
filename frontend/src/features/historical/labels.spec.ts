import { describe, expect, it } from 'vitest';
import { gapLabel, weeksAround } from './labels';

describe('history labels', () => {
  it('says how a month compares with its paper', () => {
    expect(gapLabel(0, 1)).toBe('Cuadra');
    expect(gapLabel(-5000, 1)).toBe('Faltan $50.00');
    expect(gapLabel(27000, 2)).toBe('Sobran $270.00');
    expect(gapLabel(null, 1)).toBe('Sin cifras');
    expect(gapLabel(null, 0)).toBe('Sin hoja');
  });

  it('offers the weeks a garbage row of the month can pay, including the one before it', () => {
    // August 2024 paid «SEMANA DEL 29 AL 04», the week of 29 July.
    const weeks = weeksAround('2024-08');
    expect(weeks[0]).toBe('2024-07-22');
    expect(weeks).toContain('2024-07-29');
    expect(weeks.at(-1)).toBe('2024-08-26');
  });
});
