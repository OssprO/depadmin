import { describe, expect, it } from 'vitest';
import { gapLabel } from './labels';

describe('history labels', () => {
  it('says how a month compares with its paper', () => {
    expect(gapLabel(0, 1)).toBe('Cuadra');
    expect(gapLabel(-5000, 1)).toBe('Faltan $50.00');
    expect(gapLabel(27000, 2)).toBe('Sobran $270.00');
    expect(gapLabel(null, 1)).toBe('Sin cifras');
    expect(gapLabel(null, 0)).toBe('Sin hoja');
  });
});
