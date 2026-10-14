import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../../platform/config/env.js';
import {
  ChangePassword,
  GetCurrentUser,
  ListUsers,
  PurgeExpiredSessions,
  RefreshSession,
  ResetPassword,
  SessionIssuer,
  SignIn,
  SignOut,
} from './application/index.js';
import {
  ACCESS_TOKEN_SERVICE,
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  SECRET_GENERATOR,
  USER_REPOSITORY,
} from './domain/index.js';
import { AccessTokenGuard } from './http/access-token.guard.js';
import { AuthController } from './http/auth.controller.js';
import { UsersController } from './http/users.controller.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { CryptoSecretGenerator } from './infrastructure/crypto-secret-generator.js';
import { JoseAccessTokenService } from './infrastructure/jose-access-token-service.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { PurgeExpiredSessionsJob } from './jobs/purge-expired-sessions.job.js';

@Module({
  // Only routes that opt in with LoginThrottlerGuard are limited: attempts per minute for
  // each IP and username.
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        { ttl: 60_000, limit: config.get('LOGIN_ATTEMPTS_PER_MINUTE', { infer: true }) },
      ],
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: SECRET_GENERATOR, useClass: CryptoSecretGenerator },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JoseAccessTokenService },
    // Secure by default: every route of every module needs a session unless @Public().
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    SessionIssuer,
    SignIn,
    RefreshSession,
    SignOut,
    ChangePassword,
    ResetPassword,
    GetCurrentUser,
    ListUsers,
    PurgeExpiredSessions,
    PurgeExpiredSessionsJob,
  ],
})
export class IdentityModule {}
