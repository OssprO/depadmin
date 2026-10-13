import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  const valid = {
    status: 'ok',
    version: '1.2.3',
    uptimeSeconds: 42,
    timestamp: '2026-10-07T12:00:00.000Z',
  };

  it('accepts a well-formed response', () => {
    expect(healthResponseSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['an unknown status', { ...valid, status: 'degraded' }],
    ['a negative uptime', { ...valid, uptimeSeconds: -1 }],
    ['a non-ISO timestamp', { ...valid, timestamp: 'yesterday' }],
  ])('rejects %s', (_label, input) => {
    expect(healthResponseSchema.safeParse(input).success).toBe(false);
  });
});
