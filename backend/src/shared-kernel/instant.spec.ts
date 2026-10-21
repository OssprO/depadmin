import { describe, expect, it } from 'vitest';
import { withCode } from '../../test/support/domain-error.js';
import { Instant } from './instant.js';

const at = (iso: string) => Instant.ofEpochMillis(Date.parse(iso));

describe('Instant', () => {
  it('prints ISO 8601 in UTC, like Date does', () => {
    for (const iso of [
      '2026-10-13T03:53:55.000Z',
      '1970-01-01T00:00:00.000Z',
      '2028-02-29T23:59:59.999Z',
      '1969-12-31T23:59:59.001Z',
    ]) {
      expect(at(iso).toString()).toBe(iso);
    }
    expect(JSON.stringify(at('2026-10-13T00:00:00.000Z'))).toBe('"2026-10-13T00:00:00.000Z"');
  });

  it('moves forward by seconds and days', () => {
    const start = at('2026-10-31T23:00:00.000Z');
    expect(start.plusSeconds(900).toString()).toBe('2026-10-31T23:15:00.000Z');
    expect(start.plusDays(30).toString()).toBe('2026-11-30T23:00:00.000Z');
  });

  it('compares points on the timeline', () => {
    const early = at('2026-10-13T00:00:00.000Z');
    const late = early.plusSeconds(1);
    expect(early.isBefore(late)).toBe(true);
    expect(late.isAfter(early)).toBe(true);
    expect(early.isAfter(early)).toBe(false);
    expect(early.equals(at('2026-10-13T00:00:00.000Z'))).toBe(true);
  });

  it.each([Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects %s', (value) => {
    expect(() => Instant.ofEpochMillis(value)).toThrow(withCode('INSTANT_INVALID'));
  });
});
