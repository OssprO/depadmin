import { z } from 'zod';

/** Where a browser error was caught: a thrown error, a rejected promise, or a screen. */
export const CLIENT_ERROR_KINDS = ['error', 'unhandledrejection', 'render'] as const;

export const CLIENT_ERROR_LIMITS = { message: 500, stack: 4000, path: 200 } as const;

/**
 * An error that happened in a neighbour's browser, sent to `POST /api/client-errors` so it
 * reaches the API's log (ADR-0030). It carries no personal data: no user, and the path
 * without its query string.
 */
export const clientErrorSchema = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  message: z.string().min(1).max(CLIENT_ERROR_LIMITS.message),
  stack: z.string().max(CLIENT_ERROR_LIMITS.stack).optional(),
  path: z
    .string()
    .max(CLIENT_ERROR_LIMITS.path)
    .regex(/^\/[^?#]*$/, 'A path, without query or fragment'),
});

export type ClientError = z.infer<typeof clientErrorSchema>;
