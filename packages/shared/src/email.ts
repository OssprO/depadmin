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

/** The emails a user may turn off (ADR-0034). Security notices always go out. */
export const emailTopicSchema = z.enum(['NOTICES']);
export type EmailTopic = z.infer<typeof emailTopicSchema>;

/**
 * `GET /api/account/email`: the confirmed address, the one waiting, if any, and the optional
 * emails turned off.
 */
export const accountEmailSchema = z.object({
  email: z.string().nullable(),
  pendingEmail: z.string().nullable(),
  optOuts: z.array(emailTopicSchema),
});
export type AccountEmail = z.infer<typeof accountEmailSchema>;

/** `PUT /api/account/email`: an address to confirm (the same one again sends a new link). */
export const changeEmailRequestSchema = z.object({ email: emailAddressSchema });
export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>;

/** `PUT /api/users/:id/email`: the superadmin captures or removes (null) someone's email. */
export const userEmailRequestSchema = z.object({ email: emailAddressSchema.nullable() });
export type UserEmailRequest = z.infer<typeof userEmailRequestSchema>;

/** `PUT /api/account/email/topics/:topic`: whether to get those emails. */
export const emailTopicParamsSchema = z.object({ topic: emailTopicSchema });
export type EmailTopicParams = z.infer<typeof emailTopicParamsSchema>;
export const emailTopicRequestSchema = z.object({ receive: z.boolean() });
export type EmailTopicRequest = z.infer<typeof emailTopicRequestSchema>;

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

/** `POST /api/email/unsubscribe/:token`, from the link at the foot of an email. */
export const unsubscribeParamsSchema = z.object({ token: linkTokenSchema });
export type UnsubscribeParams = z.infer<typeof unsubscribeParamsSchema>;

/** The accounts of that address that no longer get those emails. */
export const unsubscribeResponseSchema = z.object({
  topic: emailTopicSchema,
  accounts: z.array(z.string()),
});
export type UnsubscribeResponse = z.infer<typeof unsubscribeResponseSchema>;
