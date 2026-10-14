import { z } from 'zod';
import { localDateSchema, unitNumberSchema, yearMonthSchema } from './units.js';

/**
 * - `SKIPPED_SHIFT`: the scheduled depto did not take its shift; it pays the penalty.
 * - `INACTIVE_UNIT`: the scheduled depto is inactive; the superadmin assigns a cover.
 * - `OTHER`: any other agreed change.
 */
export const delegationReasonSchema = z.enum(['SKIPPED_SHIFT', 'INACTIVE_UNIT', 'OTHER']);
export type DelegationReason = z.infer<typeof delegationReasonSchema>;

export const shiftDelegationSchema = z.object({
  id: z.uuid(),
  from: yearMonthSchema,
  to: yearMonthSchema,
  originalUnit: unitNumberSchema,
  delegateUnit: unitNumberSchema,
  reason: delegationReasonSchema,
});
export type ShiftDelegation = z.infer<typeof shiftDelegationSchema>;

/** Who answers for one month. */
export const shiftMonthSchema = z.object({
  month: yearMonthSchema,
  /** The scheduled period (two months) the month belongs to. */
  period: z.object({ start: yearMonthSchema, end: yearMonthSchema }),
  scheduledUnit: unitNumberSchema,
  scheduledUnitActive: z.boolean(),
  /** The active delegation covering the month, if any. */
  delegation: shiftDelegationSchema.nullable(),
  /** Deptos whose owners can write the month; empty while an inactive depto has no cover. */
  responsibleUnits: z.array(unitNumberSchema),
  /** Whether the caller can delegate this month now. */
  canDelegate: z.boolean(),
});
export type ShiftMonth = z.infer<typeof shiftMonthSchema>;

export const MAX_CALENDAR_MONTHS = 36;

/** `GET /api/shifts/calendar?from=2026-08&to=2027-07`. */
export const shiftCalendarQuerySchema = z.object({ from: yearMonthSchema, to: yearMonthSchema });
export type ShiftCalendarQuery = z.infer<typeof shiftCalendarQuerySchema>;

export const shiftCalendarResponseSchema = z.array(shiftMonthSchema);

/** `GET /api/shifts/current`: for the dashboard. */
export const currentShiftResponseSchema = z.object({
  /** Today in the building. */
  today: localDateSchema,
  current: shiftMonthSchema,
  /** The first month of the next period. */
  next: shiftMonthSchema,
  /** Deptos inactive this month. */
  inactiveUnits: z.array(unitNumberSchema),
});
export type CurrentShiftResponse = z.infer<typeof currentShiftResponseSchema>;

/** `POST /api/shifts/delegations`. The depto it is taken from is the scheduled one. */
export const createDelegationRequestSchema = z
  .object({
    from: yearMonthSchema,
    to: yearMonthSchema,
    delegateUnit: unitNumberSchema,
    reason: delegationReasonSchema,
  })
  .refine((body) => body.from <= body.to, {
    path: ['to'],
    message: 'El último mes no puede ser anterior al primero',
  });
export type CreateDelegationRequest = z.infer<typeof createDelegationRequestSchema>;
