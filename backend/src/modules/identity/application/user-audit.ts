import { type AuditSubject, Redacted } from '../../../shared-kernel/index.js';
import type { User } from '../domain/index.js';

/** Audit actions of the identity module. */
export const UserAuditAction = {
  PASSWORD_CHANGED: 'USER_PASSWORD_CHANGED',
  PASSWORD_RESET: 'USER_PASSWORD_RESET',
  CREATED: 'USER_CREATED',
  ACCESS_CHANGED: 'USER_ACCESS_CHANGED',
  DISABLED: 'USER_DISABLED',
  ENABLED: 'USER_ENABLED',
  EMAIL_REQUESTED: 'USER_EMAIL_REQUESTED',
  EMAIL_CONFIRMED: 'USER_EMAIL_CONFIRMED',
  EMAIL_REMOVED: 'USER_EMAIL_REMOVED',
  PASSWORD_RECOVERED: 'USER_PASSWORD_RECOVERED',
  EMAIL_TOPICS_CHANGED: 'USER_EMAIL_TOPICS_CHANGED',
  UNSUBSCRIBED: 'USER_UNSUBSCRIBED',
} as const;

/**
 * A user in the audit log. The password hash is compared, never stored, and so are the
 * addresses: the log lasts forever, and old personal data has no place in it (ADR-0033).
 */
export const USER_AUDIT: AuditSubject<User> = {
  entity: 'user',
  id: (user) => user.id,
  label: (user) => user.username,
  snapshot: (user) => ({
    username: user.username,
    role: user.role,
    unit: user.unit?.value ?? null,
    password: new Redacted(user.passwordHash),
    mustChangePassword: user.mustChangePassword,
    expiresOn: user.expiresOn && String(user.expiresOn),
    disabled: user.disabled,
    email: new Redacted(user.email),
    pendingEmail: new Redacted(user.pendingEmail),
    noticesByEmail: user.wants('NOTICES'),
  }),
};
