import type { EmailUnsubscribe, Instant, OutgoingEmail } from '../../../shared-kernel/index.js';
import type { User } from '../domain/index.js';

// What the identity module writes to people (ADR-0033). The bare minimum: emails go through
// a third party, and a mistyped address reaches a stranger, so no amounts, no names and not
// even the building's. They do name the account, because one person may have two.

/** How long a notice is worth sending: after that, it is old news. */
const NOTICE_DAYS = 3;

export const EmailKind = {
  CONFIRMATION: 'EMAIL_CONFIRMATION',
  RECOVERY: 'PASSWORD_RECOVERY',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  EMAIL_CHANGED: 'EMAIL_CHANGED',
} as const;

/** Where the confirmation link leads; its secret goes after the `#`, which no server sees. */
export const CONFIRM_EMAIL_PATH = '/account/email/confirm';
export const RESET_PASSWORD_PATH = '/reset-password';
/** The page that stops an optional email (ADR-0034); its link goes after the `#` too. */
export const UNSUBSCRIBE_PATH = '/email/unsubscribe';

/** The page, and the API address mail apps post to for their own button (RFC 8058). */
export function unsubscribeFor(token: string): EmailUnsubscribe {
  return { page: `${UNSUBSCRIBE_PATH}#${token}`, oneClick: `/api/email/unsubscribe/${token}` };
}

const account = (user: User) => `«${user.username}»`;

export function confirmationEmail(
  user: User,
  to: string,
  token: string,
  expiresAt: Instant,
): OutgoingEmail {
  return {
    kind: EmailKind.CONFIRMATION,
    to,
    subject: 'Confirma tu correo en DepAdmin',
    paragraphs: [
      `Se registró este correo para la cuenta ${account(user)} de DepAdmin, la app de tu edificio.`,
      'Para confirmarlo, toca el botón y entra con esa cuenta. El enlace vence en 60 días.',
      'Si no esperabas este correo, ignóralo: sin confirmar, no recibirás nada más.',
    ],
    action: { label: 'Confirmar mi correo', path: `${CONFIRM_EMAIL_PATH}#${token}` },
    urgent: false,
    sendBy: expiresAt,
  };
}

export function recoveryEmail(
  user: User,
  to: string,
  token: string,
  expiresAt: Instant,
): OutgoingEmail {
  return {
    kind: EmailKind.RECOVERY,
    to,
    subject: 'Recupera tu contraseña de DepAdmin',
    paragraphs: [
      `Alguien pidió cambiar la contraseña de la cuenta ${account(user)} de DepAdmin.`,
      'Si fuiste tú, toca el botón para elegir una nueva. El enlace vence en 1 hora y sirve una sola vez.',
      'Si no fuiste tú, ignora este correo: tu contraseña no cambia.',
    ],
    action: { label: 'Elegir una contraseña nueva', path: `${RESET_PASSWORD_PATH}#${token}` },
    urgent: true,
    sendBy: expiresAt,
  };
}

/** Whenever an account's password changes: if it was not its owner, they learn at once. */
export function passwordChangedEmail(user: User, to: string, now: Instant): OutgoingEmail {
  return {
    kind: EmailKind.PASSWORD_CHANGED,
    to,
    subject: 'Tu contraseña de DepAdmin cambió',
    paragraphs: [
      `La contraseña de la cuenta ${account(user)} de DepAdmin acaba de cambiar, y se cerraron sus sesiones abiertas.`,
      'Si fuiste tú, no tienes que hacer nada.',
      'Si no fuiste tú, avisa de inmediato al superadmin de la app para que bloquee la cuenta.',
    ],
    action: null,
    urgent: true,
    sendBy: now.plusDays(NOTICE_DAYS),
  };
}

/** To the address being replaced, once the new one is confirmed. */
export function emailChangedEmail(user: User, to: string, now: Instant): OutgoingEmail {
  return {
    kind: EmailKind.EMAIL_CHANGED,
    to,
    subject: 'El correo de tu cuenta de DepAdmin cambió',
    paragraphs: [
      `La cuenta ${account(user)} de DepAdmin ahora usa otro correo, ya confirmado. Desde hoy, sus avisos y la recuperación de su contraseña llegan allá.`,
      'Si no fuiste tú, avisa de inmediato al superadmin de la app.',
    ],
    action: null,
    urgent: true,
    sendBy: now.plusDays(NOTICE_DAYS),
  };
}
