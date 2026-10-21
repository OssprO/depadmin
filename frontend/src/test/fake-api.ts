import type { CurrentUser, SessionResponse } from '@depadmin/shared';
import { vi } from 'vitest';

type Handler = (request: {
  body: unknown;
  headers: Headers;
  search: URLSearchParams;
}) => Response | Promise<Response>;

/**
 * Stubs `fetch` with handlers keyed by "METHOD /path" (e.g. "POST /api/auth/login"); the
 * query string is passed to the handler as `search`, not matched. Unknown
 * routes answer 404, and every call is recorded for assertions.
 */
export function fakeApi(handlers: Record<string, Handler>) {
  const calls: { route: string; search: URLSearchParams; headers: Headers; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, 'http://localhost');
    const route = `${init.method ?? 'GET'} ${url.pathname}`;
    const headers = new Headers(init.headers);
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ route, search: url.searchParams, headers, body });
    const handler = handlers[route];
    return handler
      ? handler({ body, headers, search: url.searchParams })
      : problem(404, 'NOT_FOUND');
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, callsTo: (route: string) => calls.filter((c) => c.route === route) };
}

export function problem(status: number, code: string): Response {
  return Response.json(
    { type: 'about:blank', title: 'Error', status, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export const owner501: CurrentUser = {
  id: '0b9d8f5e-7c2a-4f4e-9d6b-3f1e2a7c5b10',
  username: '501',
  role: 'OWNER',
  unit: 501,
  mustChangePassword: false,
};

/** A read-only user: the tenant of 302. */
export const tenant302: CurrentUser = {
  id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b10',
  username: 'inquilino.302',
  role: 'READER',
  unit: 302,
  mustChangePassword: false,
};

export const superadmin: CurrentUser = {
  id: '7f3c2b1a-9e8d-4c6b-8a5f-1e2d3c4b5a60',
  username: 'admin',
  role: 'SUPERADMIN',
  unit: null,
  mustChangePassword: false,
};

export function sessionFor(user: CurrentUser, accessToken = `token-${user.username}`) {
  const body: SessionResponse = { accessToken, expiresInSeconds: 900, user };
  return () => Response.json(body);
}
