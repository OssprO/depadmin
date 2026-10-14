import { z } from 'zod';

/**
 * Every API error, as RFC 9457 Problem Details plus a stable `code` (e.g.
 * `INVALID_CREDENTIALS`, `MONTH_CLOSED`) that the frontend translates to Spanish.
 */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string().min(1),
  /** For `VALIDATION_FAILED`: what is wrong with each field of the request. */
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
