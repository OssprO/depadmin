import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest, IS_PUBLIC } from '../../../platform/http/auth.js';
import { UnauthenticatedError } from '../../../shared-kernel/index.js';
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from '../domain/index.js';

/**
 * Global guard: every route needs `Authorization: Bearer <access token>` unless marked
 * @Public(). It only establishes *who* is calling. *What* they may do (superadmin only,
 * write windows) is decided by the use cases through the domain policies, so the rules hold
 * whichever adapter calls them, not just HTTP.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    const actor = scheme === 'Bearer' && token ? await this.accessTokens.verify(token) : null;
    if (!actor) {
      throw new UnauthenticatedError('UNAUTHENTICATED', 'A valid access token is required');
    }
    request.actor = actor;
    return true;
  }
}
