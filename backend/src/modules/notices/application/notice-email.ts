import type { Instant, LocalDate, OutgoingEmail } from '../../../shared-kernel/index.js';
import type { EmailRecipient } from '../../identity/application/index.js';
import type { Notice, NoticeAuthor } from '../domain/index.js';

/** Where the email's button leads. */
export const NOTICES_PATH = '/notices';

/** An email that waits longer would arrive as old news. */
const SEND_WITHIN_DAYS = 3;

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** «30 de noviembre de 2026». */
const longDate = (date: LocalDate) => {
  const [year, month, day] = String(date).split('-').map(Number);
  return `${day} de ${MONTHS[month! - 1]} de ${year}`;
};

const byWhom = (author: NoticeAuthor) =>
  author.role === 'OWNER'
    ? `El administrador en turno (depto ${author.unit.value})`
    : 'El superadmin';

/** «la cuenta «502»», «las cuentas «admin» y «501»». */
const accounts = (usernames: readonly string[]) => {
  const quoted = usernames.map((username) => `«${username}»`);
  return quoted.length === 1
    ? `la cuenta ${quoted[0]}`
    : `las cuentas ${quoted.slice(0, -1).join(', ')} y ${quoted.at(-1)}`;
};

/**
 * A notice by email (ADR-0034), to an address that confirmed it and did not turn notices
 * off. Unlike the security emails it carries the text: whoever writes it is warned that it
 * goes by email. It names the accounts it reaches, because one person may have two, and it
 * goes out within 3 days or, for one with a last day, by the day after it, or not at all.
 */
export function noticeEmail(
  notice: Notice,
  recipient: EmailRecipient,
  today: LocalDate,
  now: Instant,
): OutgoingEmail {
  const { expiresOn } = notice;
  const days = expiresOn
    ? Math.min(SEND_WITHIN_DAYS, today.daysUntil(expiresOn) + 1)
    : SEND_WITHIN_DAYS;
  return {
    kind: 'NOTICE',
    to: recipient.address,
    subject: `Aviso: ${notice.title}`,
    paragraphs: [
      `${byWhom(notice.author)} publicó este aviso en DepAdmin, la app de tu edificio:`,
      `«${notice.title}»`,
      ...notice.lines,
      ...(expiresOn ? [`Vigente hasta el ${longDate(expiresOn)}.`] : []),
      `Te llega por ${accounts(recipient.accounts)}. Puedes dejar de recibir los avisos por correo en «Mi cuenta», o con el enlace del final.`,
    ],
    action: { label: 'Ver los avisos', path: NOTICES_PATH },
    urgent: false,
    sendBy: now.plusDays(days),
    unsubscribe: recipient.unsubscribe,
  };
}
