import type { EmailAction, Instant, OutgoingEmail } from '../../../shared-kernel/index.js';

/**
 * - `PENDING`: waits to go out, now or at `nextAttemptAt`.
 * - `SENT`: the provider took it.
 * - `FAILED`: refused for good (an address that does not exist), or too many attempts.
 * - `EXPIRED`: its `sendBy` passed before it could go out.
 */
export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED' | 'EXPIRED';

/** Attempts before giving an email up: with the waits below, about 4 hours of trying. */
export const MAX_ATTEMPTS = 8;
const MAX_WAIT_MINUTES = 6 * 60;

/** 1, 2, 4… minutes after the first, second, third… failure, never more than 6 hours. */
export function retryWaitMinutes(attempts: number): number {
  return Math.min(2 ** Math.max(attempts - 1, 0), MAX_WAIT_MINUTES);
}

export interface OutboxMessageProps {
  readonly id: string;
  readonly kind: string;
  readonly recipient: string;
  readonly subject: string;
  /** Empty once it stops being pending: a sent email keeps no link. */
  readonly paragraphs: readonly string[];
  readonly action: EmailAction | null;
  readonly urgent: boolean;
  readonly status: EmailStatus;
  readonly attempts: number;
  readonly nextAttemptAt: Instant;
  readonly sendBy: Instant;
  readonly lastError: string | null;
  readonly createdAt: Instant;
  readonly sentAt: Instant | null;
  readonly finishedAt: Instant | null;
}

/** What the sender needs: the words, and where it goes. */
export interface EmailToSend {
  readonly to: string;
  readonly subject: string;
  readonly paragraphs: readonly string[];
  readonly action: EmailAction | null;
}

/**
 * One email of the outbox (ADR-0033). It waits until the provider takes it, is retried with
 * longer and longer waits when the provider fails, and is dropped once its link would arrive
 * expired. When it stops being pending its words and link are wiped, so the record left
 * holds no working link.
 */
export class OutboxMessage {
  /** Everything it holds, for the repository. */
  private constructor(readonly props: OutboxMessageProps) {}

  static enqueue(id: string, email: OutgoingEmail, now: Instant): OutboxMessage {
    return new OutboxMessage({
      id,
      kind: email.kind,
      recipient: email.to,
      subject: email.subject,
      paragraphs: [...email.paragraphs],
      action: email.action,
      urgent: email.urgent,
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: now,
      sendBy: email.sendBy,
      lastError: null,
      createdAt: now,
      sentAt: null,
      finishedAt: null,
    });
  }

  static restore(props: OutboxMessageProps): OutboxMessage {
    return new OutboxMessage(props);
  }

  get id(): string {
    return this.props.id;
  }

  get status(): EmailStatus {
    return this.props.status;
  }

  get attempts(): number {
    return this.props.attempts;
  }

  get content(): EmailToSend {
    const { recipient, subject, paragraphs, action } = this.props;
    return { to: recipient, subject, paragraphs, action };
  }

  /** Its link would arrive expired: it is dropped instead of sent. */
  isLateAt(now: Instant): boolean {
    return !now.isBefore(this.props.sendBy);
  }

  /** The provider took it. */
  sent(now: Instant): OutboxMessage {
    return this.finish('SENT', now, { sentAt: now, lastError: null });
  }

  /**
   * The provider did not take it. A permanent failure, the last attempt, or a retry that
   * would come after `sendBy` ends it; otherwise it waits and is tried again.
   */
  failed(error: string, permanent: boolean, now: Instant): OutboxMessage {
    const attempts = this.props.attempts + 1;
    const lastError = error.slice(0, 500);
    if (permanent || attempts >= MAX_ATTEMPTS) {
      return this.finish('FAILED', now, { attempts, lastError });
    }
    const nextAttemptAt = now.plusSeconds(retryWaitMinutes(attempts) * 60);
    if (!nextAttemptAt.isBefore(this.props.sendBy)) {
      return this.finish('EXPIRED', now, { attempts, lastError });
    }
    return new OutboxMessage({ ...this.props, attempts, lastError, nextAttemptAt });
  }

  /** Its `sendBy` passed while it waited. */
  expired(now: Instant): OutboxMessage {
    return this.finish('EXPIRED', now, {});
  }

  private finish(
    status: Exclude<EmailStatus, 'PENDING'>,
    now: Instant,
    changes: Partial<OutboxMessageProps>,
  ): OutboxMessage {
    return new OutboxMessage({
      ...this.props,
      ...changes,
      status,
      paragraphs: [],
      action: null,
      finishedAt: now,
    });
  }
}
