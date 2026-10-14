import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared-kernel/index.js';
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from '../domain/index.js';

/**
 * Deletes the refresh tokens that have expired. An expired token is refused anyway, so
 * keeping it only grows the table; the live and recently rotated ones stay, since reuse
 * detection needs them.
 */
@Injectable()
export class PurgeExpiredSessions {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly tokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    return this.tokens.deleteExpired(this.clock.now());
  }
}
