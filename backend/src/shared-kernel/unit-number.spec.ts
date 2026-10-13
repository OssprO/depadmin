import { describe, expect, it } from 'vitest';
import { withCode } from '../../test/support/domain-error.js';
import { UnitNumber } from './unit-number.js';

describe('UnitNumber', () => {
  it('accepts the ten deptos of the building', () => {
    expect(UnitNumber.all().map(Number)).toEqual([
      101, 102, 201, 202, 301, 302, 401, 402, 501, 502,
    ]);
  });

  it.each([100, 103, 0, 601, 99, 501.5, Number.NaN])('rejects %s', (value) => {
    expect(() => UnitNumber.of(value)).toThrow(withCode('UNIT_NUMBER_INVALID'));
  });

  it('interns instances so identity equals equality', () => {
    expect(UnitNumber.of(501)).toBe(UnitNumber.of(501));
    expect(UnitNumber.of(501).equals(UnitNumber.of(502))).toBe(false);
    expect(UnitNumber.of(402).floor).toBe(4);
    expect(String(UnitNumber.of(402))).toBe('402');
    expect(JSON.stringify([UnitNumber.of(101)])).toBe('[101]');
  });
});
