import { networkError } from './api-error';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface TransportOptions {
  readonly method?: Method;
  readonly body?: unknown;
  readonly accessToken?: string | null;
}

/** One JSON request, with no session logic. A connection failure becomes `NETWORK_ERROR`. */
export async function send(
  url: string,
  { method = 'GET', body, accessToken }: TransportOptions = {},
): Promise<Response> {
  try {
    return await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw networkError();
  }
}
