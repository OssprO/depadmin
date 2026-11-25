// In-memory adapters for the mail use case specs. Excluded from the build.
import type { Instant } from '../../../shared-kernel/index.js';
import {
  DeliveryFailure,
  type EmailSender,
  type EmailToSend,
  OutboxMessage,
  type OutboxRepository,
} from '../domain/index.js';

export class InMemoryOutboxRepository implements OutboxRepository {
  readonly rows = new Map<string, OutboxMessage>();
  private readonly claims = new Map<string, Instant>();

  add(message: OutboxMessage): Promise<void> {
    this.rows.set(message.id, message);
    return Promise.resolve();
  }

  claimDue(now: Instant, limit: number, until: Instant): Promise<OutboxMessage[]> {
    const due = [...this.rows.values()]
      .filter(({ props, id }) => {
        const claim = this.claims.get(id);
        return (
          props.status === 'PENDING' &&
          !props.nextAttemptAt.isAfter(now) &&
          (!claim || !claim.isAfter(now))
        );
      })
      .sort(
        (a, b) =>
          Number(b.props.urgent) - Number(a.props.urgent) ||
          a.props.createdAt.epochMillis - b.props.createdAt.epochMillis,
      )
      .slice(0, limit);
    for (const message of due) this.claims.set(message.id, until);
    return Promise.resolve(due);
  }

  save(message: OutboxMessage): Promise<void> {
    this.rows.set(message.id, message);
    this.claims.delete(message.id);
    return Promise.resolve();
  }

  countSentSince(since: Instant): Promise<number> {
    return Promise.resolve(
      [...this.rows.values()].filter(({ props }) => props.sentAt?.isAfter(since)).length,
    );
  }

  expireLate(now: Instant): Promise<number> {
    const late = [...this.rows.values()].filter(
      (message) => message.status === 'PENDING' && message.isLateAt(now),
    );
    for (const message of late) this.rows.set(message.id, message.expired(now));
    return Promise.resolve(late.length);
  }

  countPending(): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((m) => m.status === 'PENDING').length);
  }

  deleteFinishedBefore(at: Instant): Promise<number> {
    const old = [...this.rows.values()].filter(({ props }) => props.finishedAt?.isBefore(at));
    for (const message of old) this.rows.delete(message.id);
    return Promise.resolve(old.length);
  }

  statusOf(id: string) {
    return this.rows.get(id)?.status;
  }
}

/** Records what it sends; `failWith` makes the next sends fail. */
export class FakeEmailSender implements EmailSender {
  configured = true;
  readonly sent: EmailToSend[] = [];
  failWith: DeliveryFailure | Error | null = null;

  send(email: EmailToSend): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(email);
    return Promise.resolve();
  }
}

export { DeliveryFailure };
