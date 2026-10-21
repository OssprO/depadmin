import { z } from 'zod';

/** The building's deptos, by door number: floors 1–5, two doors each. */
export const UNIT_NUMBERS = [101, 102, 201, 202, 301, 302, 401, 402, 501, 502] as const;
export type UnitNumberValue = (typeof UNIT_NUMBERS)[number];

export const unitNumberSchema = z.literal(UNIT_NUMBERS, { error: 'Elige un depto' });

/** A month as "YYYY-MM". */
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido');

/** A calendar date as "YYYY-MM-DD". */
export const localDateSchema = z.iso.date();

export const OWNER_NAME_MAX_LENGTH = 80;

export const unitSchema = z.object({
  number: unitNumberSchema,
  /** As the monthly report shows it; null until the superadmin sets it. */
  ownerName: z.string().nullable(),
  /** Whether it is active in the current month. */
  activeNow: z.boolean(),
  /** Whole months; `to` is null while it stays inactive. */
  inactivePeriods: z.array(z.object({ from: yearMonthSchema, to: yearMonthSchema.nullable() })),
});
export type Unit = z.infer<typeof unitSchema>;

export const unitListResponseSchema = z.array(unitSchema);

/** `POST /api/units/:number/status`: inactive (or active again) from a month on. */
export const setUnitStatusRequestSchema = z.object({
  active: z.boolean(),
  from: yearMonthSchema,
});
export type SetUnitStatusRequest = z.infer<typeof setUnitStatusRequestSchema>;

export const ownerNameSchema = z
  .string()
  .trim()
  .max(OWNER_NAME_MAX_LENGTH, `Máximo ${OWNER_NAME_MAX_LENGTH} caracteres`);

/** `PUT /api/units/:number/owner`: the owner's name; blank or null clears it. */
export const renameOwnerRequestSchema = z.object({ ownerName: ownerNameSchema.nullable() });
export type RenameOwnerRequest = z.infer<typeof renameOwnerRequestSchema>;
