import type { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Fetches `/api{path}` and validates the body against a shared contract, so a
 * backend/frontend mismatch fails loudly here instead of deep inside the UI.
 */
export async function getJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.infer<Schema>> {
  const response = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} respondió ${response.status}`);
  }
  return schema.parse(await response.json());
}
