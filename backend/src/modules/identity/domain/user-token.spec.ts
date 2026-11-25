import { describe, expect, it } from 'vitest';
import { Instant } from '../../../shared-kernel/index.js';
import {
  EMAIL_CONFIRMATION_LIFETIME_DAYS,
  PASSWORD_RECOVERY_LIFETIME_SECONDS,
  UserToken,
} from './user-token.js';

const now = Instant.ofEpochMillis(Date.parse('2026-11-25T18:00:00Z'));
const secret = { id: 't-1', tokenHash: 'hash' };

describe('UserToken', () => {
  it('confirms one address for 60 days', () => {
    const link = UserToken.emailConfirmation(secret, 'u-501', 'vecina@ejemplo.mx', now);

    expect(link).toMatchObject({ purpose: 'EMAIL_CONFIRMATION', email: 'vecina@ejemplo.mx' });
    const lastSecond = now.plusDays(EMAIL_CONFIRMATION_LIFETIME_DAYS).plusSeconds(-1);
    expect(link.worksFor('EMAIL_CONFIRMATION', lastSecond)).toBe(true);
    expect(link.stateAt(now.plusDays(EMAIL_CONFIRMATION_LIFETIME_DAYS))).toBe('EXPIRED');
  });

  it('recovers a password for an hour, and only as a recovery', () => {
    const link = UserToken.passwordRecovery(secret, 'u-501', now);

    expect(link.email).toBeNull();
    expect(link.worksFor('PASSWORD_RECOVERY', now.plusSeconds(59 * 60))).toBe(true);
    expect(link.worksFor('EMAIL_CONFIRMATION', now)).toBe(false);
    expect(link.stateAt(now.plusSeconds(PASSWORD_RECOVERY_LIFETIME_SECONDS))).toBe('EXPIRED');
  });

  it('tells a used link from a replaced one, even after they expire', () => {
    const link = UserToken.passwordRecovery(secret, 'u-501', now);
    const later = now.plusDays(1);
    const used = UserToken.restore({ ...props(link), usedAt: now, revokedAt: now });
    const revoked = UserToken.restore({ ...props(link), revokedAt: now });

    expect(used.stateAt(later)).toBe('USED');
    expect(revoked.stateAt(later)).toBe('REVOKED');
    expect(revoked.worksFor('PASSWORD_RECOVERY', now)).toBe(false);
  });
});

function props(token: UserToken) {
  const { id, userId, purpose, tokenHash, email, expiresAt, usedAt, revokedAt, createdAt } = token;
  return { id, userId, purpose, tokenHash, email, expiresAt, usedAt, revokedAt, createdAt };
}
