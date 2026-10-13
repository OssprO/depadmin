import { describe, expect, it } from 'vitest';
import { withCode } from '../../test/support/domain-error.js';
import { LocalDate } from './local-date.js';
import { YearMonth } from './year-month.js';

describe('YearMonth', () => {
  it('parses and prints YYYY-MM', () => {
    const month = YearMonth.parse('2026-08');
    expect(month.year).toBe(2026);
    expect(month.month).toBe(8);
    expect(month.toString()).toBe('2026-08');
    expect(JSON.stringify(month)).toBe('"2026-08"');
  });

  it.each(['2026-13', '2026-00', '2026-8', 'agosto', '0000-01'])('rejects "%s"', (text) => {
    expect(() => YearMonth.parse(text)).toThrow(withCode('YEAR_MONTH_INVALID'));
  });

  it('rejects non-integer parts', () => {
    expect(() => YearMonth.of(2026.5, 1)).toThrow(withCode('YEAR_MONTH_INVALID'));
    expect(() => YearMonth.of(2026, 1).plus(0.5)).toThrow(withCode('YEAR_MONTH_INVALID'));
  });

  it('crosses year boundaries', () => {
    expect(YearMonth.of(2026, 12).next().toString()).toBe('2027-01');
    expect(YearMonth.of(2027, 1).previous().toString()).toBe('2026-12');
    expect(YearMonth.of(2026, 8).plus(-20).toString()).toBe('2024-12');
  });

  it('measures and lists months', () => {
    const aug = YearMonth.of(2026, 8);
    expect(aug.monthsUntil(YearMonth.of(2027, 2))).toBe(6);
    expect(aug.monthsUntil(YearMonth.of(2026, 6))).toBe(-2);
    expect(aug.through(YearMonth.of(2026, 10)).map(String)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(aug.through(aug.previous())).toEqual([]);
  });

  it('compares months', () => {
    const aug = YearMonth.of(2026, 8);
    const sep = YearMonth.of(2026, 9);
    expect(aug.isBefore(sep)).toBe(true);
    expect(sep.isAfter(aug)).toBe(true);
    expect(aug.compareTo(sep)).toBe(-1);
    expect(aug.equals(YearMonth.parse('2026-08'))).toBe(true);
    expect(YearMonth.min(aug, sep)).toBe(aug);
    expect(YearMonth.max(aug, sep)).toBe(sep);
  });

  it('knows its days and dates', () => {
    expect(YearMonth.of(2028, 2).daysInMonth).toBe(29);
    expect(YearMonth.of(2026, 2).daysInMonth).toBe(28);
    expect(YearMonth.of(2026, 9).contains(LocalDate.of(2026, 9, 30))).toBe(true);
    expect(YearMonth.of(2026, 9).contains(LocalDate.of(2026, 10, 1))).toBe(false);
    expect(YearMonth.of(2026, 9).contains(LocalDate.of(2025, 9, 1))).toBe(false);
  });
});
