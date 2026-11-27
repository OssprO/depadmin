import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { Env } from '../../platform/config/env.js';
import {
  ChangeEmail,
  ChangeEmailTopic,
  ChangePassword,
  ChangeUserAccess,
  CheckRecoveryLink,
  ConfirmEmail,
  CreateReader,
  DisableUser,
  EmailRecipients,
  EnableUser,
  GetCurrentUser,
  ListUsers,
  PasswordRecoveryAvailability,
  PurgeExpiredSessions,
  RecoverPassword,
  RefreshSession,
  RequestPasswordRecovery,
  ResetPassword,
  SessionIssuer,
  SignIn,
  SignOut,
  Unsubscribe,
} from './application/index.js';
import {
  ACCESS_TOKEN_SERVICE,
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  SECRET_GENERATOR,
  UNSUBSCRIBE_LINKS,
  USER_REPOSITORY,
  USER_TOKEN_REPOSITORY,
} from './domain/index.js';
import { AccountController } from './http/account.controller.js';
import { AccessTokenGuard } from './http/access-token.guard.js';
import { AuthController } from './http/auth.controller.js';
import { UnsubscribeController } from './http/unsubscribe.controller.js';
import { UsersController } from './http/users.controller.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { CryptoSecretGenerator } from './infrastructure/crypto-secret-generator.js';
import { HmacUnsubscribeLinks } from './infrastructure/hmac-unsubscribe-links.js';
import { JoseAccessTokenService } from './infrastructure/jose-access-token-service.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { PrismaUserTokenRepository } from './infrastructure/prisma-user-token.repository.js';
import { PurgeExpiredSessionsJob } from './jobs/purge-expired-sessions.job.js';

@Module({
  controllers: [AuthController, AccountController, UsersController, UnsubscribeController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: USER_TOKEN_REPOSITORY, useClass: PrismaUserTokenRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: SECRET_GENERATOR, useClass: CryptoSecretGenerator },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JoseAccessTokenService },
    {
      provide: UNSUBSCRIBE_LINKS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new HmacUnsubscribeLinks(config.get('JWT_SECRET', { infer: true })),
    },
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
    CreateReader,
    ChangeUserAccess,
    DisableUser,
    EnableUser,
    ChangeEmail,
    ConfirmEmail,
    PasswordRecoveryAvailability,
    RequestPasswordRecovery,
    CheckRecoveryLink,
    RecoverPassword,
    PurgeExpiredSessions,
    PurgeExpiredSessionsJob,
    ChangeEmailTopic,
    Unsubscribe,
    EmailRecipients,
  ],
  // For the modules that write optional emails (notices).
  exports: [EmailRecipients],
})
export class IdentityModule {}
