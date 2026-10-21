import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { Instant } from '../../../shared-kernel/index.js';
import { REFRESH_TOKEN_LIFETIME_DAYS, RefreshToken } from './refresh-token.js';

const now = Instant.ofEpochMillis(Date.parse('2026-10-13T12:00:00Z'));
const session = { id: 'session-1', userId: 'u-501' };
const issued = () => RefreshToken.issue({ id: 't1', tokenHash: 'h1' }, session, now);

describe('RefreshToken', () => {
  it('is active until it expires, unused, after the lifetime', () => {
    const token = issued();
    const expiry = now.plusDays(REFRESH_TOKEN_LIFETIME_DAYS);

    expect(token).toMatchObject({ sessionId: 'session-1', userId: 'u-501', expiresAt: expiry });
    expect(token.stateAt(expiry.plusSeconds(-1))).toBe('ACTIVE');
    expect(token.stateAt(expiry)).toBe('EXPIRED');
  });

  it('rotates into a successor of the same session with a fresh lifetime', () => {
    const later = now.plusDays(10);
    const { rotated, next } = issued().rotate({ id: 't2', tokenHash: 'h2' }, later);

    expect(rotated.stateAt(later)).toBe('ROTATED');
    expect(rotated.rotatedAt).toEqual(later);
    expect(next).toMatchObject({ id: 't2', tokenHash: 'h2', sessionId: 'session-1' });
    expect(next.expiresAt).toEqual(later.plusDays(REFRESH_TOKEN_LIFETIME_DAYS));
    expect(next.stateAt(later)).toBe('ACTIVE');
  });

  it('can be rotated only once', () => {
    const { rotated } = issued().rotate({ id: 't2', tokenHash: 'h2' }, now);

    expect(() => rotated.rotate({ id: 't3', tokenHash: 'h3' }, now)).toThrow(
      withCode('REFRESH_TOKEN_NOT_ACTIVE'),
    );
  });

  it('reports revocation before rotation and expiry', () => {
    const token = RefreshToken.restore({
      id: 't1',
      sessionId: 'session-1',
      userId: 'u-501',
      tokenHash: 'h1',
      expiresAt: now,
      rotatedAt: now,
      revokedAt: now,
    });

    expect(token.stateAt(now.plusDays(1))).toBe('REVOKED');
    expect(token.revokedAt).toEqual(now);
  });
});
