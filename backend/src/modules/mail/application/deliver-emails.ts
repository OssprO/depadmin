import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared-kernel/index.js';
import {
  DeliveryFailure,
  EMAIL_SENDER,
  type EmailSender,
  MAIL_SETTINGS,
  type MailSettings,
  OUTBOX_REPOSITORY,
  type OutboxRepository,
} from '../domain/index.js';

/** Emails taken at a time; each batch is held this long, far more than sending it takes. */
const BATCH_SIZE = 20;
const CLAIM_SECONDS = 5 * 60;
/** Records of what went out stay this long, then go. */
const KEEP_DAYS = 30;

/**
 * Of the daily limit, what only urgent emails (a password recovery) may use, so a notice to
 * everyone never leaves someone locked out until tomorrow (ADR-0034): 10 of the 90.
 */
export function urgentReserve(dailyLimit: number): number {
  return Math.min(10, Math.floor(dailyLimit / 4));
}

/** What one delivery run did. */
export interface DeliveryReport {
  readonly sent: number;
  /** Failed this time and will be tried again. */
  readonly retrying: number;
  /** Given up: refused for good, or out of attempts or time. */
  readonly failed: number;
  readonly expired: number;
  /** Still pending at the end: no provider, the daily limit, or a retry later. */
  readonly waiting: number;
  /** The daily limit stopped it. */
  readonly limited: boolean;
}

/**
 * Sends what is due in the outbox (ADR-0033), urgent first, without going over the daily
 * limit in any 24 hours; the last emails of that limit are kept for the urgent ones. Drops
 * what would arrive expired, retries what the provider did not take, and forgets, after 30
 * days, what stopped being pending. Without a provider it only drops the expired ones.
 */
@Injectable()
export class DeliverEmails {
  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(MAIL_SETTINGS) private readonly settings: MailSettings,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<DeliveryReport> {
    const start = this.clock.now();
    let expired = await this.outbox.expireLate(start);
    await this.outbox.deleteFinishedBefore(start.plusDays(-KEEP_DAYS));
    let sent = 0;
    let retrying = 0;
    let failed = 0;
    let limited = false;
    while (this.sender.configured) {
      const now = this.clock.now();
      const room = this.settings.dailyLimit - (await this.outbox.countSentSince(now.plusDays(-1)));
      if (room <= 0) {
        limited = (await this.outbox.countPending()) > 0;
        break;
      }
      const reserve = urgentReserve(this.settings.dailyLimit);
      const urgentOnly = room <= reserve;
      const limit = Math.min(urgentOnly ? room : room - reserve, BATCH_SIZE);
      const until = now.plusSeconds(CLAIM_SECONDS);
      const batch = await this.outbox.claimDue(now, limit, until, urgentOnly);
      for (const message of batch) {
        if (message.isLateAt(this.clock.now())) {
          await this.outbox.save(message.expired(this.clock.now()));
          expired++;
          continue;
        }
        try {
          await this.sender.send(message.content);
          await this.outbox.save(message.sent(this.clock.now()));
          sent++;
        } catch (error) {
          const failure =
            error instanceof DeliveryFailure ? error : new DeliveryFailure(String(error), false);
          const next = message.failed(failure.message, failure.permanent, this.clock.now());
          await this.outbox.save(next);
          if (next.status === 'PENDING') retrying++;
          else if (next.status === 'FAILED') failed++;
          else expired++;
        }
      }
      if (batch.length < limit) {
        // Whatever the reserve holds back, the limit stopped.
        if (urgentOnly) limited = (await this.outbox.countPending()) > 0;
        break;
      }
    }
    const waiting = await this.outbox.countPending();
    return { sent, retrying, failed, expired, waiting, limited };
  }
}

/** "Sent 2 emails; 1 will be retried", or null when nothing happened. */
export function describeDelivery(report: DeliveryReport): string | null {
  const parts: string[] = [];
  if (report.sent) parts.push(`sent ${report.sent}`);
  if (report.retrying) parts.push(`${report.retrying} failed and will be retried`);
  if (report.failed) parts.push(`${report.failed} failed for good`);
  if (report.expired) parts.push(`${report.expired} expired unsent`);
  if (report.limited) parts.push(`the daily limit holds ${report.waiting} back`);
  else if (report.waiting && !report.retrying) parts.push(`${report.waiting} waiting`);
  return parts.length ? `Emails: ${parts.join('; ')}` : null;
}
