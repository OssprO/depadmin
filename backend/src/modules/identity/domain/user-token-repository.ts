import type { Instant } from '../../../shared-kernel/index.js';
import type { UserToken, UserTokenPurpose } from './user-token.js';

export interface UserTokenRepository {
  findByHash(tokenHash: string): Promise<UserToken | null>;
  add(token: UserToken): Promise<void>;
  /**
   * Marks it used at `at`, but only if it was still active in storage. Returns false when
   * another request used it first, so a link can never work twice.
   */
  use(token: UserToken, at: Instant): Promise<boolean>;
  /** Revokes the user's active links for `purpose` (a newer one replaces them). */
  revokeActive(userId: string, purpose: UserTokenPurpose, at: Instant): Promise<void>;
  /** How many links for `purpose` the user was sent since `since`, for the hourly limit. */
  countIssuedSince(userId: string, purpose: UserTokenPurpose, since: Instant): Promise<number>;
  /** Deletes the links that expired before `at`; returns how many. */
  deleteExpired(at: Instant): Promise<number>;
}

export const USER_TOKEN_REPOSITORY = Symbol('UserTokenRepository');
