import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared-kernel/index.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  SECRET_GENERATOR,
  type SecretGenerator,
} from '../domain/index.js';

/** Ends the session the refresh token belongs to. Signing out twice is not an error. */
@Injectable()
export class SignOut {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(token: string | undefined): Promise<void> {
    if (!token) return;
    const current = await this.refreshTokens.findByHash(this.secrets.hashRefreshToken(token));
    if (current && !current.revokedAt) {
      await this.refreshTokens.revokeSession(current.sessionId, this.clock.now());
    }
  }
}
