import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type CompleteRecoveryRequest,
  completeRecoveryRequestSchema,
  type CurrentUser,
  type EmailLinkRequest,
  emailLinkRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type PasswordRecoveryAvailability,
  type PasswordRecoveryRequest,
  passwordRecoveryRequestSchema,
  type RecoveryLinkResponse,
  type SessionResponse,
} from '@depadmin/shared';
import type { Request, Response } from 'express';
import { CurrentActor, Public } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { type Actor, UnauthenticatedError } from '../../../shared-kernel/index.js';
import {
  ChangePassword,
  CheckRecoveryLink,
  GetCurrentUser,
  type IssuedSession,
  PasswordRecoveryAvailability as RecoveryAvailability,
  RecoverPassword,
  RefreshSession,
  RequestPasswordRecovery,
  SignIn,
  SignOut,
} from '../application/index.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';
import { toCurrentUser, toSessionResponse } from './presenters.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

/**
 * Recovery requests from one IP an hour (ADR-0033). Each depto has its own internet, so this
 * is one household's; the 3 an hour per username are counted by the use case, silently.
 */
export const PASSWORD_RECOVERIES_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly signIn: SignIn,
    private readonly refreshSession: RefreshSession,
    private readonly signOut: SignOut,
    private readonly changePassword: ChangePassword,
    private readonly currentUser: GetCurrentUser,
    private readonly recoveryAvailability: RecoveryAvailability,
    private readonly requestRecovery: RequestPasswordRecovery,
    private readonly checkRecoveryLink: CheckRecoveryLink,
    private readonly recoverPassword: RecoverPassword,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  // At most LOGIN_ATTEMPTS_PER_MINUTE attempts per IP and username (throttling.module.ts).
  @UseGuards(LoginThrottlerGuard)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    return respond(response, await this.signIn.execute(body));
  }

  /** Called by the SPA on load and whenever the access token expires. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const token = readRefreshCookie(request);
    try {
      if (!token) throw new UnauthenticatedError('SESSION_INVALID', 'No refresh token');
      return respond(response, await this.refreshSession.execute(token));
    } catch (error) {
      if (error instanceof UnauthenticatedError) clearRefreshCookie(response);
      throw error;
    }
  }

  /** Public, so it works even after the access token expired. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.signOut.execute(readRefreshCookie(request));
    clearRefreshCookie(response);
  }

  @Get('me')
  async me(@CurrentActor() actor: Actor): Promise<CurrentUser> {
    return toCurrentUser(await this.currentUser.execute(actor));
  }

  @Post('password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async password(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    return respond(response, await this.changePassword.execute(actor, body));
  }

  /** Whether the login offers «¿Olvidaste tu contraseña?»: only with a provider to send it. */
  @Public()
  @Get('password-recovery')
  recoveryAvailable(): PasswordRecoveryAvailability {
    return { available: this.recoveryAvailability.execute() };
  }

  /** Always 202 and nothing else, whether a link went out or not. */
  @Public()
  @Post('password-recovery')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: PASSWORD_RECOVERIES_PER_HOUR, ttl: HOUR_MS } })
  async recover(
    @Body(new ZodValidationPipe(passwordRecoveryRequestSchema)) body: PasswordRecoveryRequest,
  ): Promise<void> {
    await this.requestRecovery.execute(body.username);
  }

  /** POST, not GET: the link's secret never goes in an address the logs keep. */
  @Public()
  @Post('password-recovery/check')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  check(
    @Body(new ZodValidationPipe(emailLinkRequestSchema)) body: EmailLinkRequest,
  ): Promise<RecoveryLinkResponse> {
    return this.checkRecoveryLink.execute(body.token);
  }

  /** Every session of the account ends; the app then goes to the login. */
  @Public()
  @Post('password-recovery/complete')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async complete(
    @Body(new ZodValidationPipe(completeRecoveryRequestSchema)) body: CompleteRecoveryRequest,
  ): Promise<void> {
    await this.recoverPassword.execute(body.token, body.newPassword);
  }
}

function respond(response: Response, session: IssuedSession): SessionResponse {
  setRefreshCookie(response, session.refreshToken.token, session.refreshToken.expiresAt);
  return toSessionResponse(session);
}
