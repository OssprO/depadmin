import type { z } from 'zod';
import { readApiError } from './api-error';
import type { SessionStore } from './session';
import { type Method, send } from './transport';

export { ApiError } from './api-error';

let currentSession: SessionStore | null = null;

/** Called once at startup, so every request carries the signed-in user's access token. */
export function connectSession(session: SessionStore | null): void {
  currentSession = session;
}

/**
 * Calls `/api{path}` with the access token. On a 401 it refreshes the session once and
 * retries; if the session is over, the session store turns anonymous and the router sends
 * the user to the login screen.
 */
export async function apiFetch(
  path: string,
  { method = 'GET', body }: { method?: Method; body?: unknown } = {},
): Promise<Response> {
  const request = (accessToken: string | null) =>
    send(`/api${path}`, { method, body, accessToken });

  let response = await request(currentSession?.accessToken ?? null);
  if (response.status === 401 && currentSession) {
    const token = await currentSession.refresh();
    if (token) response = await request(token);
  }
  if (!response.ok) throw await readApiError(response);
  return response;
}

/**
 * Fetches and validates the body against a shared contract, so a backend/frontend mismatch
 * fails loudly here instead of deep inside the UI.
 */
export async function getJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.infer<Schema>> {
  return schema.parse(await (await apiFetch(path)).json());
}

export async function sendJson<Schema extends z.ZodType>(
  method: Exclude<Method, 'GET'>,
  path: string,
  body: unknown,
  schema: Schema,
): Promise<z.infer<Schema>> {
  return schema.parse(await (await apiFetch(path, { method, body })).json());
}
