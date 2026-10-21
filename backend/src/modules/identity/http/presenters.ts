import type { CurrentUser, SessionResponse, UserSummary } from '@depadmin/shared';
import type { LocalDate } from '../../../shared-kernel/index.js';
import type { IssuedSession } from '../application/index.js';
import type { User } from '../domain/index.js';

export function toCurrentUser(user: User): CurrentUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    unit: user.unit?.value ?? null,
    mustChangePassword: user.mustChangePassword,
  };
}

/** As the superadmin's list shows it, on `today` (to tell who has expired). */
export function toUserSummary(user: User, today: LocalDate): UserSummary {
  return {
    ...toCurrentUser(user),
    hasPassword: user.canSignIn,
    expiresOn: user.expiresOn && String(user.expiresOn),
    disabled: user.disabled,
    expired: user.hasExpiredOn(today),
  };
}

/** The refresh token is left out on purpose: it goes in the cookie. */
export function toSessionResponse(session: IssuedSession): SessionResponse {
  return {
    accessToken: session.accessToken.token,
    expiresInSeconds: session.accessToken.expiresInSeconds,
    user: toCurrentUser(session.user),
  };
}
