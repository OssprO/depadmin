import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared-kernel/index.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  USER_TOKEN_REPOSITORY,
  type UserTokenRepository,
} from '../domain/index.js';

/**
 * Deletes the refresh tokens and the email links that have expired. An expired one is
 * refused anyway, so keeping it only grows the table; the live and recently rotated refresh
 * tokens stay, since reuse detection needs them, and so do the used links that have not
 * expired, so following a confirmation twice still answers that it is confirmed.
 */
@Injectable()
export class PurgeExpiredSessions {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly tokens: RefreshTokenRepository,
    @Inject(USER_TOKEN_REPOSITORY) private readonly links: UserTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ refreshTokens: number; links: number }> {
    const now = this.clock.now();
    return {
      refreshTokens: await this.tokens.deleteExpired(now),
      links: await this.links.deleteExpired(now),
    };
  }
}
