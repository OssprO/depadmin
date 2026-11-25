import type { EmailToSend } from './outbox-message.js';

/** The provider did not take an email. `permanent` when retrying cannot help. */
export class DeliveryFailure extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'DeliveryFailure';
  }
}

/** Port: hands an email to the provider (SMTP in production, Mailpit in development). */
export interface EmailSender {
  /** False without a provider: emails then wait in the outbox. */
  readonly configured: boolean;
  /** Throws a `DeliveryFailure` when the provider does not take it. */
  send(email: EmailToSend): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EmailSender');

/** How much may go out: the provider's free plan allows 100 emails a day. */
export interface MailSettings {
  /** Emails sent in any 24 hours, at most. */
  readonly dailyLimit: number;
}

export const MAIL_SETTINGS = Symbol('MailSettings');
