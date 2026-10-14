import { describe, expect, it } from 'vitest';
import { SystemClock } from './system-clock.js';

const clockAt = (iso: string) => new SystemClock(undefined, () => Date.parse(iso));

describe('SystemClock', () => {
  it('turns the day at midnight in Mexico City (UTC-6), not at UTC midnight', () => {
    expect(clockAt('2026-10-01T05:59:59Z').today().toString()).toBe('2026-09-30');
    expect(clockAt('2026-10-01T06:00:00Z').today().toString()).toBe('2026-10-01');
  });

  it('reads the current instant', () => {
    expect(clockAt('2026-10-13T12:00:00.123Z').now().toString()).toBe('2026-10-13T12:00:00.123Z');
  });
});
