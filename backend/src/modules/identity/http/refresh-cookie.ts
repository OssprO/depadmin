import type { CookieOptions, Request, Response } from 'express';
import type { Instant } from '../../../shared-kernel/index.js';

export const REFRESH_COOKIE = 'depadmin_refresh';

/**
 * - httpOnly: JavaScript (and so an XSS payload) can never read it.
 * - Secure: HTTPS only. Browsers treat http://localhost as secure, so development works.
 * - SameSite=Strict: never sent from another site's page, which rules out CSRF.
 * - Path: sent only to the auth endpoints, not with every API call.
 */
const OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth',
};

export function readRefreshCookie(request: Request): string | undefined {
  const value: unknown = request.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value ? value : undefined;
}

export function setRefreshCookie(response: Response, token: string, expiresAt: Instant): void {
  response.cookie(REFRESH_COOKIE, token, {
    ...OPTIONS,
    expires: new Date(expiresAt.epochMillis),
  });
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE, OPTIONS);
}
