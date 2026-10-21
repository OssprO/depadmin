import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type CurrentUser,
  type LoginRequest,
  loginRequestSchema,
  type SessionResponse,
} from '@depadmin/shared';
import type { Request, Response } from 'express';
import { CurrentActor, Public } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { type Actor, UnauthenticatedError } from '../../../shared-kernel/index.js';
import {
  ChangePassword,
  GetCurrentUser,
  type IssuedSession,
  RefreshSession,
  SignIn,
  SignOut,
} from '../application/index.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';
import { toCurrentUser, toSessionResponse } from './presenters.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly signIn: SignIn,
    private readonly refreshSession: RefreshSession,
    private readonly signOut: SignOut,
    private readonly changePassword: ChangePassword,
    private readonly currentUser: GetCurrentUser,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  // At most LOGIN_ATTEMPTS_PER_MINUTE attempts per IP and username (identity.module.ts).
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
}

function respond(response: Response, session: IssuedSession): SessionResponse {
  setRefreshCookie(response, session.refreshToken.token, session.refreshToken.expiresAt);
  return toSessionResponse(session);
}
