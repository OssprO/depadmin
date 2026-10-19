import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  UNIT_OF_WORK,
  UnauthenticatedError,
  type UnitOfWork,
} from '../../../shared-kernel/index.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  SECRET_GENERATOR,
  type SecretGenerator,
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/index.js';
import { type IssuedSession, SessionIssuer } from './session-issuer.js';

type Outcome =
  | { readonly ok: true; readonly session: IssuedSession }
  | { readonly ok: false; readonly code: 'SESSION_INVALID' | 'REFRESH_TOKEN_REUSED' };

/**
 * Exchanges a refresh token for a new pair (rotation). A token that was already exchanged
 * means a copy is in someone else's hands: the whole session is revoked and both the thief
 * and the user must sign in again.
 */
@Injectable()
export class RefreshSession {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(token: string): Promise<IssuedSession> {
    // The failure is thrown after the transaction commits: throwing inside it would roll
    // back the revocation that a reused token must leave behind.
    const outcome = await this.unitOfWork.run(() => this.rotate(token));
    if (!outcome.ok) {
      throw new UnauthenticatedError(outcome.code, 'The session is no longer valid');
    }
    return outcome.session;
  }

  private async rotate(token: string): Promise<Outcome> {
    const now = this.clock.now();
    const current = await this.refreshTokens.findByHash(this.secrets.hashRefreshToken(token));
    if (!current) return { ok: false, code: 'SESSION_INVALID' };

    const state = current.stateAt(now);
    if (state === 'ROTATED') {
      await this.refreshTokens.revokeSession(current.sessionId, now);
      return { ok: false, code: 'REFRESH_TOKEN_REUSED' };
    }
    if (state !== 'ACTIVE') return { ok: false, code: 'SESSION_INVALID' };

    // A user deactivated or past their expiry loses their sessions at the next refresh.
    const user = await this.users.findById(current.userId);
    if (!user?.canSignInOn(this.clock.today())) {
      await this.refreshTokens.revokeSession(current.sessionId, now);
      return { ok: false, code: 'SESSION_INVALID' };
    }

    const fresh = this.sessions.nextToken();
    const { rotated, next } = current.rotate(fresh.next, now);
    if (!(await this.refreshTokens.rotate(rotated, next))) {
      // Another request rotated it between our read and our write: also a reuse.
      await this.refreshTokens.revokeSession(current.sessionId, now);
      return { ok: false, code: 'REFRESH_TOKEN_REUSED' };
    }
    return { ok: true, session: await this.sessions.issue(user, fresh.token, next) };
  }
}
