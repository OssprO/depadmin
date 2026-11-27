import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Env } from '../../../platform/config/env.js';
import { DeliveryFailure, type EmailSender, type EmailToSend } from '../domain/index.js';
import { layOut } from './email-layout.js';

/** Nodemailer's error, as far as this adapter reads it. */
interface SmtpError {
  code?: unknown;
  responseCode?: unknown;
  message?: unknown;
}

/**
 * Sends through SMTP (Resend in production, Mailpit in development; ADR-0033). Port 465 is
 * TLS from the start; on any other port the connection must upgrade with STARTTLS, except on
 * the local Mailpit, which has no certificate.
 */
@Injectable()
export class SmtpEmailSender implements EmailSender, OnModuleDestroy {
  readonly configured: boolean;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly transport;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    const port = config.get('SMTP_PORT', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.configured = host !== '';
    this.from = config.get('EMAIL_FROM', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true });
    const local = ['localhost', '127.0.0.1', 'mailpit'].includes(host);
    this.transport = createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465 && !local,
      ...(user && { auth: { user, pass: config.get('SMTP_PASSWORD', { infer: true }) } }),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(email: EmailToSend): Promise<void> {
    const { text, html } = layOut(email, this.appUrl);
    try {
      await this.transport.sendMail({
        from: this.from,
        to: email.to,
        subject: email.subject,
        text,
        html,
        // The mail app's own button posts to the API (RFC 8058); an optional email only.
        ...(email.unsubscribe && {
          headers: {
            'List-Unsubscribe': `<${this.appUrl}${email.unsubscribe.oneClick}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });
    } catch (error) {
      const { code, responseCode, message } = (error ?? {}) as SmtpError;
      const reason = [code, responseCode, message].filter(Boolean).map(String).join(' ');
      // A recipient the provider refuses will be refused again. Anything else (the network,
      // a wrong key) may get better, so the email waits.
      throw new DeliveryFailure(reason || String(error), code === 'EENVELOPE');
    }
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
