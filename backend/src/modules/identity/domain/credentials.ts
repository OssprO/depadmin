import type { Actor } from '../../../shared-kernel/index.js';

/** Port: one-way password hashing (argon2id in production). */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PasswordHasher');

/** Port: unguessable secrets, from a cryptographically secure source. */
export interface SecretGenerator {
  /** A new refresh token and the hash under which it is stored. */
  refreshToken(): { token: string; tokenHash: string };
  /** The hash of a refresh token presented by a client, to look it up. */
  hashRefreshToken(token: string): string;
  /** Easy to dictate or copy from a chat, but long enough to resist guessing. */
  temporaryPassword(): string;
}

export const SECRET_GENERATOR = Symbol('SecretGenerator');

/** Long enough to cover a burst of requests, short enough that a stolen one soon expires. */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;

export interface AccessToken {
  readonly token: string;
  readonly expiresInSeconds: number;
}

/**
 * Port: short-lived, self-contained access tokens (a signed JWT). Verifying one needs no
 * database round trip, which is why they last minutes and the refresh token weeks.
 */
export interface AccessTokenService {
  issue(actor: Actor): Promise<AccessToken>;
  /** The actor the token was issued to, or null if it is malformed, forged or expired. */
  verify(token: string): Promise<Actor | null>;
}

export const ACCESS_TOKEN_SERVICE = Symbol('AccessTokenService');
