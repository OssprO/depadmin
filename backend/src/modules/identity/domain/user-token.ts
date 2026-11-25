import type { Instant } from '../../../shared-kernel/index.js';
import type { NewToken } from './refresh-token.js';

/** What a link sent by email is for. */
export type UserTokenPurpose = 'EMAIL_CONFIRMATION' | 'PASSWORD_RECOVERY';

/** Long, because opening the app is not a daily thing: the link waits for its owner. */
export const EMAIL_CONFIRMATION_LIFETIME_DAYS = 60;

/** Short: whoever reads the mailbox in that hour can take the account. */
export const PASSWORD_RECOVERY_LIFETIME_SECONDS = 60 * 60;

/** Links of one purpose a user may be sent in an hour, so nobody floods their mailbox. */
export const LINKS_PER_HOUR = 3;

/**
 * - `ACTIVE`: it works, once.
 * - `USED`: it worked already.
 * - `REVOKED`: replaced by a newer link of the same purpose, or its email was removed.
 * - `EXPIRED`: past its lifetime.
 */
export type UserTokenState = 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';

export interface UserTokenProps {
  readonly id: string;
  readonly userId: string;
  readonly purpose: UserTokenPurpose;
  /** Only a hash is stored: a copy of the database holds no working link. */
  readonly tokenHash: string;
  /** The address a confirmation is for; null for a recovery. */
  readonly email: string | null;
  readonly expiresAt: Instant;
  readonly usedAt: Instant | null;
  readonly revokedAt: Instant | null;
  readonly createdAt: Instant;
}

/**
 * A link that works once, sent by email (ADR-0033): to confirm an address, or to choose a new
 * password. Its secret travels only in the email; the database keeps its hash.
 */
export class UserToken {
  private constructor(private readonly props: UserTokenProps) {}

  /** Confirms `email` as the user's address, for `EMAIL_CONFIRMATION_LIFETIME_DAYS`. */
  static emailConfirmation(token: NewToken, userId: string, email: string, now: Instant) {
    return new UserToken({
      ...token,
      userId,
      purpose: 'EMAIL_CONFIRMATION',
      email,
      expiresAt: now.plusDays(EMAIL_CONFIRMATION_LIFETIME_DAYS),
      usedAt: null,
      revokedAt: null,
      createdAt: now,
    });
  }

  /** Lets its holder choose a new password, for `PASSWORD_RECOVERY_LIFETIME_SECONDS`. */
  static passwordRecovery(token: NewToken, userId: string, now: Instant) {
    return new UserToken({
      ...token,
      userId,
      purpose: 'PASSWORD_RECOVERY',
      email: null,
      expiresAt: now.plusSeconds(PASSWORD_RECOVERY_LIFETIME_SECONDS),
      usedAt: null,
      revokedAt: null,
      createdAt: now,
    });
  }

  static restore(props: UserTokenProps): UserToken {
    return new UserToken(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get purpose(): UserTokenPurpose {
    return this.props.purpose;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get email(): string | null {
    return this.props.email;
  }

  get expiresAt(): Instant {
    return this.props.expiresAt;
  }

  get usedAt(): Instant | null {
    return this.props.usedAt;
  }

  get revokedAt(): Instant | null {
    return this.props.revokedAt;
  }

  get createdAt(): Instant {
    return this.props.createdAt;
  }

  /** Use wins over revocation, which wins over expiry. */
  stateAt(now: Instant): UserTokenState {
    if (this.props.usedAt) return 'USED';
    if (this.props.revokedAt) return 'REVOKED';
    if (!now.isBefore(this.props.expiresAt)) return 'EXPIRED';
    return 'ACTIVE';
  }

  /** Whether it is an active link for `purpose` at `now`. */
  worksFor(purpose: UserTokenPurpose, now: Instant): boolean {
    return this.props.purpose === purpose && this.stateAt(now) === 'ACTIVE';
  }
}
