import type { Instant } from '../../../shared-kernel/index.js';
import type { RefreshToken } from './refresh-token.js';

export interface RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  add(token: RefreshToken): Promise<void>;
  /**
   * Stores the rotation of `rotated` and adds `next`, but only if `rotated` was still active
   * in storage. Returns false when another request rotated or revoked it first, so two
   * concurrent refreshes with the same token can never both succeed.
   */
  rotate(rotated: RefreshToken, next: RefreshToken): Promise<boolean>;
  revokeSession(sessionId: string, at: Instant): Promise<void>;
  revokeAllOf(userId: string, at: Instant): Promise<void>;
  /** Deletes the tokens that expired before `at`; returns how many. */
  deleteExpired(at: Instant): Promise<number>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('RefreshTokenRepository');
