import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.js';

/**
 * Request limits, per minute. Only routes that opt in with a guard are limited: the login
 * (LOGIN_ATTEMPTS_PER_MINUTE for each IP and username, the default) and the browser errors,
 * which set their own limit with @Throttle. ThrottlerModule is global.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        { ttl: 60_000, limit: config.get('LOGIN_ATTEMPTS_PER_MINUTE', { infer: true }) },
      ],
    }),
  ],
})
export class ThrottlingModule {}
