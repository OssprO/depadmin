import { ConflictError, type Instant } from '../../../shared-kernel/index.js';

/** How long a refresh token lasts without use. Each refresh starts the count again. */
export const REFRESH_TOKEN_LIFETIME_DAYS = 30;

/**
 * - `ACTIVE`: can be exchanged for a new pair of tokens, once.
 * - `ROTATED`: already exchanged. Presenting it again means someone else has a copy.
 * - `EXPIRED`: unused for `REFRESH_TOKEN_LIFETIME_DAYS`.
 * - `REVOKED`: its session was ended (logout, password change or reset, or reuse).
 */
export type RefreshTokenState = 'ACTIVE' | 'ROTATED' | 'EXPIRED' | 'REVOKED';

export interface RefreshTokenProps {
  readonly id: string;
  /** Every token issued from one sign-in shares it, so the whole chain can be revoked. */
  readonly sessionId: string;
  readonly userId: string;
  /** Only a hash is stored: a database leak does not leak usable tokens. */
  readonly tokenHash: string;
  readonly expiresAt: Instant;
  readonly rotatedAt: Instant | null;
  readonly revokedAt: Instant | null;
}

/** What the caller supplies for a new token: an id and the hash of a fresh random secret. */
export interface NewToken {
  readonly id: string;
  readonly tokenHash: string;
}

/**
 * One link of a session's refresh-token chain. Using a token rotates it: it becomes
 * `ROTATED` and a successor in the same session takes its place. A thief who copied a token
 * and the legitimate user cannot both keep using it: as soon as one of them presents the
 * already rotated token, the reuse is detected and the whole session is revoked (OWASP).
 */
export class RefreshToken {
  private constructor(private readonly props: RefreshTokenProps) {}

  static issue(
    token: NewToken,
    session: { id: string; userId: string },
    now: Instant,
  ): RefreshToken {
    return new RefreshToken({
      ...token,
      sessionId: session.id,
      userId: session.userId,
      expiresAt: now.plusDays(REFRESH_TOKEN_LIFETIME_DAYS),
      rotatedAt: null,
      revokedAt: null,
    });
  }

  static restore(props: RefreshTokenProps): RefreshToken {
    return new RefreshToken(props);
  }

  get id(): string {
    return this.props.id;
  }

  get sessionId(): string {
    return this.props.sessionId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Instant {
    return this.props.expiresAt;
  }

  get rotatedAt(): Instant | null {
    return this.props.rotatedAt;
  }

  get revokedAt(): Instant | null {
    return this.props.revokedAt;
  }

  /** Revocation wins over rotation, which wins over expiry. */
  stateAt(now: Instant): RefreshTokenState {
    if (this.props.revokedAt) return 'REVOKED';
    if (this.props.rotatedAt) return 'ROTATED';
    if (!now.isBefore(this.props.expiresAt)) return 'EXPIRED';
    return 'ACTIVE';
  }

  /** Exchanges this token for its successor in the same session. */
  rotate(successor: NewToken, now: Instant): { rotated: RefreshToken; next: RefreshToken } {
    const state = this.stateAt(now);
    if (state !== 'ACTIVE') {
      throw new ConflictError('REFRESH_TOKEN_NOT_ACTIVE', `Refresh token ${this.id} is ${state}`);
    }
    return {
      rotated: new RefreshToken({ ...this.props, rotatedAt: now }),
      next: RefreshToken.issue(successor, { id: this.sessionId, userId: this.userId }, now),
    };
  }
}
