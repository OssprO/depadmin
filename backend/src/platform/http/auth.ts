import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from '../../shared-kernel/index.js';

// Every route requires a valid access token unless it opts out with @Public(). The guard
// that enforces it lives in the identity module; these markers are shared by all modules.

export const IS_PUBLIC = 'depadmin:isPublic';

/** The route works without signing in (health, login, refresh, logout). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthenticatedRequest = Request & { actor?: Actor };

/** The signed-in user, as set by the access-token guard. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const { actor } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!actor) throw new Error('@CurrentActor() used on a route without authentication');
  return actor;
});
