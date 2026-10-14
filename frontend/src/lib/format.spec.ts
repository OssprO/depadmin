import { describe, expect, it } from 'vitest';
import { dayKey, formatDay, formatDuration, formatTime } from './format';

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
