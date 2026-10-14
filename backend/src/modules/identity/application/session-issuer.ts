import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock, type Instant } from '../../../shared-kernel/index.js';
import {
  ACCESS_TOKEN_SERVICE,
  type AccessToken,
  type AccessTokenService,
  REFRESH_TOKEN_REPOSITORY,
  RefreshToken,
  type RefreshTokenRepository,
  SECRET_GENERATOR,
  type SecretGenerator,
  type User,
} from '../domain/index.js';

/** What a client gets when a session starts or continues. */
export interface IssuedSession {
  readonly user: User;
  readonly accessToken: AccessToken;
  /** Goes only into an httpOnly cookie; never into a response body. */
  readonly refreshToken: { readonly token: string; readonly expiresAt: Instant };
}

/** Issues the token pair for the sign-in, refresh and password-change use cases. */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** A new session (a new device, or the same one after a password change). */
  async start(user: User): Promise<IssuedSession> {
    const { token, tokenHash } = this.secrets.refreshToken();
    const refreshToken = RefreshToken.issue(
      { id: randomUUID(), tokenHash },
      { id: randomUUID(), userId: user.id },
      this.clock.now(),
    );
    await this.refreshTokens.add(refreshToken);
    return this.issue(user, token, refreshToken);
  }

  /** A fresh secret for the next link of a session's chain. */
  nextToken(): { token: string; next: { id: string; tokenHash: string } } {
    const { token, tokenHash } = this.secrets.refreshToken();
    return { token, next: { id: randomUUID(), tokenHash } };
  }

  async issue(user: User, token: string, refreshToken: RefreshToken): Promise<IssuedSession> {
    return {
      user,
      accessToken: await this.accessTokens.issue(user.actor),
      refreshToken: { token, expiresAt: refreshToken.expiresAt },
    };
  }
}
