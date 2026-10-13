import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { ROTATION_ORDER, ShiftRotation } from './shift-rotation.js';
import { m, u } from './testing.js';

const rotation = new ShiftRotation();
const holder = (month: string) => rotation.periodFor(m(month)).unit.value;

describe('ShiftRotation', () => {
  it('starts at the anchor: August and September 2026 belong to 501', () => {
    expect(holder('2026-08')).toBe(501);
    expect(holder('2026-09')).toBe(501);
    const period = rotation.periodFor(m('2026-09'));
    expect([String(period.start), String(period.end)]).toEqual(['2026-08', '2026-09']);
  });

  it('follows the fixed order, two months each, for a whole cycle', () => {
    const months = m('2026-08').through(m('2028-03'));
    const holders = months.map((month) => rotation.periodFor(month).unit.value);
    const expected = ROTATION_ORDER.flatMap((unit) => [unit.value, unit.value]);
    expect(holders).toEqual(expected);
  });

  it('repeats every 20 months', () => {
    for (const month of m('2020-01').through(m('2032-12'))) {
      expect(rotation.periodFor(month.plus(20)).unit).toBe(rotation.periodFor(month).unit);
    }
    expect(holder('2028-04')).toBe(501);
  });

  it('computes past months backwards from the anchor', () => {
    expect(holder('2026-07')).toBe(102);
    expect(holder('2026-06')).toBe(102);
    expect(holder('2026-05')).toBe(101);
    expect(holder('2024-12')).toBe(501);
    const period = rotation.periodFor(m('2026-07'));
    expect([String(period.start), String(period.end)]).toEqual(['2026-06', '2026-07']);
  });

  it('accepts a different anchor, order or shift length', () => {
    const custom = new ShiftRotation({ month: m('2027-01'), unit: u(301) }, ROTATION_ORDER, 3);
    expect(custom.periodFor(m('2027-03')).unit.value).toBe(301);
    expect(custom.periodFor(m('2027-04')).unit.value).toBe(302);
    expect(custom.periodFor(m('2026-12')).unit.value).toBe(402);
  });

  it('rejects inconsistent configurations', () => {
    const anchor = { month: m('2026-08'), unit: u(501) };
    expect(() => new ShiftRotation(anchor, [u(501), u(501)])).toThrow(withCode('ROTATION_INVALID'));
    expect(() => new ShiftRotation(anchor, [])).toThrow(withCode('ROTATION_INVALID'));
    expect(() => new ShiftRotation(anchor, [u(101)])).toThrow(withCode('ROTATION_INVALID'));
    expect(() => new ShiftRotation(anchor, ROTATION_ORDER, 0)).toThrow(
      withCode('ROTATION_INVALID'),
    );
  });
});
