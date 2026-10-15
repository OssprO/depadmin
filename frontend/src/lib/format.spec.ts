import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  buildingToday,
  dayKey,
  dayOfWeek,
  formatDay,
  formatDuration,
  formatLocalDate,
  formatMoney,
  formatMonth,
  formatMonthRange,
  formatShortDate,
  formatTime,
  formatWeek,
  parsePesos,
  parseSignedPesos,
  pesosInput,
} from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0 s'],
    [45, '45 s'],
    [60, '1 min'],
    [3_600, '1 h'],
    [3_720, '1 h 2 min'],
    [86_400, '1 d'],
    [90_000, '1 d 1 h'],
  ])('formats %i seconds as "%s"', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('building clock', () => {
  // 03:30 UTC on the 14th is still the evening of the 13th in Mexico City (UTC−6).
  const lateEvening = '2026-10-14T03:30:00.000Z';

  it('groups by the building’s day, not UTC’s', () => {
    expect(dayKey(lateEvening)).toBe('2026-10-13');
    expect(formatDay(lateEvening)).toBe('martes, 13 de octubre de 2026');
  });

  it('shows the building’s time on a 24-hour clock', () => {
    expect(formatTime(lateEvening)).toBe('21:30');
  });
});

describe('months and money', () => {
  it('names months in Spanish', () => {
    expect(formatMonth('2026-10')).toBe('octubre 2026');
    expect(formatMonthRange('2026-10', '2026-11')).toBe('oct–nov 2026');
    expect(formatMonthRange('2026-12', '2027-01')).toBe('dic 2026 – ene 2027');
    expect(formatMonthRange('2026-10', '2026-10')).toBe('oct 2026');
  });

  it('moves across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-08', 12)).toBe('2027-08');
  });

  it('shows centavos as pesos', () => {
    expect(formatMoney(50000)).toBe('$500.00');
  });
});

describe('pesos in forms', () => {
  it('reads what people type', () => {
    expect(parsePesos('700')).toBe(70000);
    expect(parsePesos(' 150.5 ')).toBe(15050);
    expect(parsePesos('150,50')).toBe(15050);
    // A comma followed by three digits reads as thousands: ambiguous, so refused.
    expect(parsePesos('1,200')).toBeNaN();
    expect(parsePesos('1.234.5')).toBeNaN();
    expect(parsePesos('')).toBeNaN();
    expect(parsePesos('-5')).toBeNaN();
  });

  it('reads balances, which may be negative', () => {
    expect(parseSignedPesos('-1506.81')).toBe(-150681);
    expect(parseSignedPesos('712.25')).toBe(71225);
    expect(parseSignedPesos('--5')).toBeNaN();
    expect(parseSignedPesos('')).toBeNaN();
  });

  it('writes centavos back without needless decimals', () => {
    expect(pesosInput(70000)).toBe('700');
    expect(pesosInput(15050)).toBe('150.50');
    expect(pesosInput(-150681)).toBe('-1506.81');
  });

  it('knows the building’s date', () => {
    expect(buildingToday(new Date('2026-10-14T03:30:00Z'))).toBe('2026-10-13');
  });
});

describe('calendar dates', () => {
  it('names a date without shifting it to another time zone', () => {
    expect(formatLocalDate('2026-10-03')).toBe('sábado, 3 de octubre');
  });

  it('moves by days across months and years', () => {
    expect(addDays('2026-09-28', 6)).toBe('2026-10-04');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(['2026-09-28', '2026-10-04'].map(dayOfWeek)).toEqual([1, 7]);
  });

  it('names a week by its days', () => {
    expect(formatShortDate('2026-09-28')).toBe('28 sep');
    expect(formatWeek('2026-10-05')).toBe('5–11 oct');
    expect(formatWeek('2026-09-28')).toBe('28 sep – 4 oct');
  });
});
