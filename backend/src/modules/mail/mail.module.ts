import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../platform/config/env.js';
import { OUTBOX } from '../../shared-kernel/index.js';
import { DeliverEmails, EmailCourier, OutboxService } from './application/index.js';
import {
  EMAIL_SENDER,
  MAIL_SETTINGS,
  type MailSettings,
  OUTBOX_REPOSITORY,
} from './domain/index.js';
import { PrismaOutboxRepository } from './infrastructure/prisma-outbox.repository.js';
import { SmtpEmailSender } from './infrastructure/smtp-email-sender.js';
import { DeliverEmailsJob } from './jobs/deliver-emails.job.js';

/**
 * Global, like the audit trail: any module's use cases inject `OUTBOX` (a shared-kernel port)
 * without importing this module (ADR-0033).
 */
@Global()
@Module({
  providers: [
    { provide: OUTBOX_REPOSITORY, useClass: PrismaOutboxRepository },
    { provide: EMAIL_SENDER, useClass: SmtpEmailSender },
    {
      provide: MAIL_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MailSettings => ({
        dailyLimit: config.get('EMAIL_DAILY_LIMIT', { infer: true }),
      }),
    },
    DeliverEmails,
    EmailCourier,
    OutboxService,
    { provide: OUTBOX, useExisting: OutboxService },
    DeliverEmailsJob,
  ],
  exports: [OUTBOX],
})
export class MailModule {}
