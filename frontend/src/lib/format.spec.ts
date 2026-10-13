import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

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
