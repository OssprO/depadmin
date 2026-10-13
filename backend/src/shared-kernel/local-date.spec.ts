import { describe, expect, it } from 'vitest';
import { withCode } from '../../test/support/domain-error.js';
import { LocalDate } from './local-date.js';
import { YearMonth } from './year-month.js';

describe('LocalDate', () => {
  it('parses and prints YYYY-MM-DD', () => {
    const date = LocalDate.parse('2026-10-12');
    expect([date.year, date.month, date.day]).toEqual([2026, 10, 12]);
    expect(date.toString()).toBe('2026-10-12');
    expect(JSON.stringify(date)).toBe('"2026-10-12"');
    expect(date.yearMonth.equals(YearMonth.of(2026, 10))).toBe(true);
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'hoy', '2026-10-00'])(
    'rejects "%s"',
    (text) => {
      expect(() => LocalDate.parse(text)).toThrow();
    },
  );

  it('accepts leap days', () => {
    expect(LocalDate.parse('2028-02-29').plusDays(1).toString()).toBe('2028-03-01');
    expect(LocalDate.parse('2000-02-29').toString()).toBe('2000-02-29');
    expect(() => LocalDate.parse('2100-02-29')).toThrow(withCode('DATE_INVALID'));
  });

  it('agrees with the JavaScript calendar on every day from 1999 to 2061', () => {
    const start = Date.UTC(1999, 0, 1);
    const day = 86_400_000;
    let date = LocalDate.of(1999, 1, 1);
    for (let t = start; t < Date.UTC(2061, 0, 1); t += day) {
      const js = new Date(t);
      expect(date.toString()).toBe(js.toISOString().slice(0, 10));
      expect(date.dayOfWeek % 7).toBe(js.getUTCDay());
      date = date.plusDays(1);
    }
  });

  it('round-trips epoch days, including before 1970', () => {
    for (const text of ['1970-01-01', '1969-12-31', '1900-03-01', '2026-08-01']) {
      const date = LocalDate.parse(text);
      const epochDay = LocalDate.parse('1970-01-01').daysUntil(date);
      expect(LocalDate.ofEpochDay(epochDay).toString()).toBe(text);
    }
  });

  it('finds the Monday of the week', () => {
    // 2026-10-12 is a Monday; 2026-10-18 the Sunday of that week.
    expect(LocalDate.parse('2026-10-12').dayOfWeek).toBe(1);
    expect(LocalDate.parse('2026-10-18').dayOfWeek).toBe(7);
    expect(LocalDate.parse('2026-10-18').startOfWeek().toString()).toBe('2026-10-12');
    expect(LocalDate.parse('2026-10-01').startOfWeek().toString()).toBe('2026-09-28');
  });

  it('gives the first and last day of a month', () => {
    expect(LocalDate.firstOf(YearMonth.of(2026, 9)).toString()).toBe('2026-09-01');
    expect(LocalDate.lastOf(YearMonth.of(2026, 9)).toString()).toBe('2026-09-30');
  });

  it('compares and measures dates', () => {
    const a = LocalDate.parse('2026-09-30');
    const b = LocalDate.parse('2026-10-05');
    expect(a.daysUntil(b)).toBe(5);
    expect(a.isBefore(b)).toBe(true);
    expect(b.isAfter(a)).toBe(true);
    expect(b.compareTo(a)).toBe(1);
    expect(a.equals(LocalDate.of(2026, 9, 30))).toBe(true);
    expect(() => a.plusDays(0.5)).toThrow(withCode('DATE_INVALID'));
  });
});
