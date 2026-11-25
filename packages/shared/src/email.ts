import { z } from 'zod';
import { loginRequestSchema, newPasswordSchema } from './auth.js';

/** Email and password recovery (ADR-0033). */

export const EMAIL_MAX_LENGTH = 254;

/** An address as it is stored: lowercase, without spaces around. */
export const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Escribe un correo')
  .max(EMAIL_MAX_LENGTH, 'Ese correo es demasiado largo')
  .pipe(z.email('Escribe un correo válido, como nombre@ejemplo.com'));

/** `GET /api/account/email`: the confirmed address and the one waiting, if any. */
export const accountEmailSchema = z.object({
  email: z.string().nullable(),
  pendingEmail: z.string().nullable(),
});
export type AccountEmail = z.infer<typeof accountEmailSchema>;

/** `PUT /api/account/email`: an address to confirm (the same one again sends a new link). */
export const changeEmailRequestSchema = z.object({ email: emailAddressSchema });
export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>;

/** `PUT /api/users/:id/email`: the superadmin captures or removes (null) someone's email. */
export const userEmailRequestSchema = z.object({ email: emailAddressSchema.nullable() });
export type UserEmailRequest = z.infer<typeof userEmailRequestSchema>;

/** A link's secret, as it comes after the `#` of the address. */
export const linkTokenSchema = z.string().trim().min(1).max(200);

export const emailLinkRequestSchema = z.object({ token: linkTokenSchema });
export type EmailLinkRequest = z.infer<typeof emailLinkRequestSchema>;

/** `GET /api/auth/password-recovery`: whether the app can send recovery links now. */
export const passwordRecoveryAvailabilitySchema = z.object({ available: z.boolean() });
export type PasswordRecoveryAvailability = z.infer<typeof passwordRecoveryAvailabilitySchema>;

/** `POST /api/auth/password-recovery`: always answered the same way. */
export const passwordRecoveryRequestSchema = loginRequestSchema.pick({ username: true });
export type PasswordRecoveryRequest = z.infer<typeof passwordRecoveryRequestSchema>;

/** `POST /api/auth/password-recovery/check`: the account a working link is for. */
export const recoveryLinkResponseSchema = z.object({ username: z.string() });
export type RecoveryLinkResponse = z.infer<typeof recoveryLinkResponseSchema>;

/** `POST /api/auth/password-recovery/complete`. */
export const completeRecoveryRequestSchema = z.object({
  token: linkTokenSchema,
  newPassword: newPasswordSchema,
});
export type CompleteRecoveryRequest = z.infer<typeof completeRecoveryRequestSchema>;
