import { z } from 'zod';
import { centavosSchema } from './books.js';
import { localDateSchema, yearMonthSchema } from './units.js';

// The building's rates (ADR-0031). The building decides them by vote; the shift
// administrator records what was agreed, from a month that has not opened yet.

export const rateNameSchema = z.enum([
  'maintenanceFee',
  'cleaningPerVisit',
  'garbageWeekly',
  'shiftSkipPenalty',
]);
export type RateNameValue = z.infer<typeof rateNameSchema>;

export const RATE_AGREEMENT_MAX_LENGTH = 300;

/** `POST /api/rates/changes`. */
export const rateChangeRequestSchema = z.object({
  rate: rateNameSchema,
  /** The first month charged with the new amount. */
  from: yearMonthSchema,
  amount: centavosSchema.positive('El importe debe ser mayor que cero'),
  /** The day of the assembly that agreed it. */
  agreedOn: localDateSchema,
  /** What was agreed, as the minutes say it. */
  agreement: z
    .string()
    .trim()
    .min(1, 'Escribe qué se acordó')
    .max(RATE_AGREEMENT_MAX_LENGTH, `Máximo ${RATE_AGREEMENT_MAX_LENGTH} caracteres`),
});
export type RateChangeRequest = z.infer<typeof rateChangeRequestSchema>;

/** `DELETE /api/rates/changes/:rate/:from`. */
export const rateChangeParamsSchema = z.object({ rate: rateNameSchema, from: yearMonthSchema });
export type RateChangeParams = z.infer<typeof rateChangeParamsSchema>;

export const rateChangeSchema = z.object({
  effectiveFrom: localDateSchema,
  amount: centavosSchema,
  /** Null for the initial values and the building's history. */
  agreement: z.object({ on: localDateSchema, summary: z.string() }).nullable(),
});
export type RateChangeValue = z.infer<typeof rateChangeSchema>;

/** `GET /api/rates`: every rate with its history. Everyone may read it. */
export const ratesResponseSchema = z.object({
  /** Whether the caller can change the rates now: the shift administrator. */
  canChange: z.boolean(),
  rates: z.array(
    z.object({
      rate: rateNameSchema,
      /** In force today. */
      current: centavosSchema.nullable(),
      /** Oldest first, including the changes scheduled ahead. */
      history: z.array(
        rateChangeSchema.extend({
          /** Not in force yet. */
          upcoming: z.boolean(),
          /** Whether the caller can take it back now. */
          withdrawable: z.boolean(),
        }),
      ),
      /** The first month a new change can apply from. */
      earliestMonth: yearMonthSchema,
    }),
  ),
});
export type RatesResponse = z.infer<typeof ratesResponseSchema>;
