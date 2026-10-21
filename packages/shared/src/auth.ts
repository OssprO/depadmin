import { z } from 'zod';
import { localDateSchema, unitNumberSchema } from './units.js';

/**
 * Length is what makes a password strong; composition rules ("one symbol, one digit") just
 * push people towards "Password1!" (NIST SP 800-63B). A phrase like "la casa del 501" fits.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** READER: sees what an owner sees and never writes (a tenant, a relative, an accountant). */
export const roleSchema = z.enum(['SUPERADMIN', 'OWNER', 'READER']);
export type Role = z.infer<typeof roleSchema>;

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1, 'Escribe tu usuario').max(64),
  password: z.string().min(1, 'Escribe tu contraseña').max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `Usa como máximo ${PASSWORD_MAX_LENGTH} caracteres`);

/** The fields alone, for forms that add their own (e.g. a confirmation). */
export const changePasswordFieldsSchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual').max(PASSWORD_MAX_LENGTH),
  newPassword: newPasswordSchema,
});

/** Shared refinement: apply it with `.refine(distinctNewPassword.check, distinctNewPassword.params)`. */
export const distinctNewPassword = {
  check: (body: { currentPassword: string; newPassword: string }) =>
    body.newPassword !== body.currentPassword,
  params: { path: ['newPassword'], message: 'La nueva contraseña debe ser distinta de la actual' },
};

export const changePasswordRequestSchema = changePasswordFieldsSchema.refine(
  distinctNewPassword.check,
  distinctNewPassword.params,
);
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const currentUserSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1),
  role: roleSchema,
  /** The owner's or reader's depto (e.g. 501); null for the superadmin and a reader of none. */
  unit: z.number().int().nullable(),
  /** After a reset: the app sends the user to change the temporary password first. */
  mustChangePassword: z.boolean(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

/** Login, refresh and password change. The refresh token travels only in an httpOnly cookie. */
export const sessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
  user: currentUserSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const userSummarySchema = currentUserSchema.extend({
  /** False until the superadmin gives the owner a first password. */
  hasPassword: z.boolean(),
  /** A temporary user's last day; null for no end. */
  expiresOn: localDateSchema.nullable(),
  /** Deactivated by the superadmin. */
  disabled: z.boolean(),
  /** Past its expiry, as of today in the building. */
  expired: z.boolean(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const userListResponseSchema = z.array(userSummarySchema);

export const passwordResetResponseSchema = z.object({
  temporaryPassword: z.string().min(1),
});
export type PasswordResetResponse = z.infer<typeof passwordResetResponseSchema>;

/** What the superadmin decides about a user's access: its depto (readers) and expiry. */
export const userAccessRequestSchema = z.object({
  unit: unitNumberSchema.nullable(),
  expiresOn: localDateSchema.nullable(),
});
export type UserAccessRequest = z.infer<typeof userAccessRequestSchema>;

/** `POST /api/users`: a read-only user. A number alone is a depto owner's username. */
export const createReaderRequestSchema = userAccessRequestSchema.extend({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'De 3 a 32 letras, números, punto, guion o guion bajo')
    .refine((name) => !/^\d+$/.test(name), 'Solo números es el usuario de un dueño'),
});
export type CreateReaderRequest = z.infer<typeof createReaderRequestSchema>;

export const createReaderResponseSchema = z.object({
  user: userSummarySchema,
  temporaryPassword: z.string().min(1),
});
export type CreateReaderResponse = z.infer<typeof createReaderResponseSchema>;
