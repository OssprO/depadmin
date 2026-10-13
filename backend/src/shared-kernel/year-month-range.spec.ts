import { describe, expect, it } from 'vitest';
import { withCode } from '../../test/support/domain-error.js';
import { YearMonth } from './year-month.js';
import { YearMonthRange } from './year-month-range.js';

const m = (text: string) => YearMonth.parse(text);
const range = (from: string, to?: string) =>
  to ? YearMonthRange.between(m(from), m(to)) : YearMonthRange.startingAt(m(from));

describe('YearMonthRange', () => {
  it('rejects ranges that end before they start', () => {
    expect(() => range('2026-09', '2026-08')).toThrow(withCode('RANGE_INVALID'));
  });

  it('contains months inside closed and open ranges', () => {
    expect(range('2026-08', '2026-09').contains(m('2026-09'))).toBe(true);
    expect(range('2026-08', '2026-09').contains(m('2026-10'))).toBe(false);
    expect(range('2026-08', '2026-09').contains(m('2026-07'))).toBe(false);
    expect(range('2026-08').contains(m('2099-01'))).toBe(true);
    expect(YearMonthRange.single(m('2026-08')).contains(m('2026-08'))).toBe(true);
  });

  it('detects overlaps', () => {
    expect(range('2026-08', '2026-09').overlaps(range('2026-09', '2026-10'))).toBe(true);
    expect(range('2026-08', '2026-09').overlaps(range('2026-10', '2026-11'))).toBe(false);
    expect(range('2026-10', '2026-11').overlaps(range('2026-08', '2026-09'))).toBe(false);
    expect(range('2026-08').overlaps(range('2030-01', '2030-02'))).toBe(true);
    expect(range('2026-08').overlaps(range('2020-01'))).toBe(true);
    expect(range('2026-08', '2026-09').overlaps(range('2026-10'))).toBe(false);
  });

  it('checks enclosure', () => {
    expect(range('2026-08', '2026-09').encloses(range('2026-09', '2026-09'))).toBe(true);
    expect(range('2026-08', '2026-09').encloses(range('2026-09', '2026-10'))).toBe(false);
    expect(range('2026-08', '2026-09').encloses(range('2026-07', '2026-08'))).toBe(false);
    expect(range('2026-08', '2026-09').encloses(range('2026-08'))).toBe(false);
    expect(range('2026-08').encloses(range('2027-01'))).toBe(true);
  });

  it('closes an open range and compares ranges', () => {
    const open = range('2026-08');
    expect(open.isOpenEnded).toBe(true);
    const closed = open.endingAt(m('2026-12'));
    expect(closed.isOpenEnded).toBe(false);
    expect(closed.equals(range('2026-08', '2026-12'))).toBe(true);
    expect(closed.equals(open)).toBe(false);
    expect(open.equals(range('2026-08'))).toBe(true);
    expect(String(closed)).toBe('2026-08..2026-12');
    expect(String(open)).toBe('2026-08..');
  });
});
