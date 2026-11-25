import { Injectable } from '@nestjs/common';
import { fromDbInstant, toDbInstant } from '../../../platform/prisma/db-values.js';
import type { EmailOutbox as OutboxRow } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import type { Instant } from '../../../shared-kernel/index.js';
import { OutboxMessage, type OutboxRepository } from '../domain/index.js';

/** A row as the raw claim query returns it: the columns' own names. */
interface RawOutboxRow {
  id: string;
  kind: string;
  recipient: string;
  subject: string;
  paragraphs: unknown;
  action_label: string | null;
  action_path: string | null;
  urgent: boolean;
  status: OutboxRow['status'];
  attempts: number;
  next_attempt_at: Date;
  send_by: Date;
  last_error: string | null;
  created_at: Date;
  sent_at: Date | null;
}

@Injectable()
export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async add(message: OutboxMessage): Promise<void> {
    await this.database.db.emailOutbox.create({ data: { id: message.id, ...toRow(message) } });
  }

  /**
   * SKIP LOCKED leaves alone what another courier is claiming right now, and `claimed_until`
   * what it claimed a moment ago and is still sending.
   */
  async claimDue(now: Instant, limit: number, until: Instant): Promise<OutboxMessage[]> {
    const at = toDbInstant(now);
    const rows = await this.database.db.$queryRaw<RawOutboxRow[]>`
      UPDATE email_outbox SET claimed_until = ${toDbInstant(until)}
      WHERE id IN (
        SELECT id FROM email_outbox
        WHERE status = 'PENDING' AND next_attempt_at <= ${at}
          AND (claimed_until IS NULL OR claimed_until <= ${at})
        ORDER BY urgent DESC, created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
    return rows
      .sort(
        (a, b) =>
          Number(b.urgent) - Number(a.urgent) || a.created_at.getTime() - b.created_at.getTime(),
      )
      .map(fromRaw);
  }

  async save(message: OutboxMessage): Promise<void> {
    await this.database.db.emailOutbox.update({
      where: { id: message.id },
      data: { ...toRow(message), claimedUntil: null },
    });
  }

  countSentSince(since: Instant): Promise<number> {
    return this.database.db.emailOutbox.count({ where: { sentAt: { gt: toDbInstant(since) } } });
  }

  async expireLate(now: Instant): Promise<number> {
    const at = toDbInstant(now);
    const { count } = await this.database.db.emailOutbox.updateMany({
      where: {
        status: 'PENDING',
        sendBy: { lte: at },
        OR: [{ claimedUntil: null }, { claimedUntil: { lte: at } }],
      },
      data: {
        status: 'EXPIRED',
        paragraphs: [],
        actionLabel: null,
        actionPath: null,
        finishedAt: at,
      },
    });
    return count;
  }

  countPending(): Promise<number> {
    return this.database.db.emailOutbox.count({ where: { status: 'PENDING' } });
  }

  async deleteFinishedBefore(at: Instant): Promise<number> {
    const { count } = await this.database.db.emailOutbox.deleteMany({
      where: { finishedAt: { lt: toDbInstant(at) } },
    });
    return count;
  }
}

function toRow(message: OutboxMessage) {
  const { props } = message;
  return {
    kind: props.kind,
    recipient: props.recipient,
    subject: props.subject,
    paragraphs: [...props.paragraphs],
    actionLabel: props.action?.label ?? null,
    actionPath: props.action?.path ?? null,
    urgent: props.urgent,
    status: props.status,
    attempts: props.attempts,
    nextAttemptAt: toDbInstant(props.nextAttemptAt),
    sendBy: toDbInstant(props.sendBy),
    lastError: props.lastError,
    createdAt: toDbInstant(props.createdAt),
    sentAt: props.sentAt && toDbInstant(props.sentAt),
    finishedAt: props.finishedAt && toDbInstant(props.finishedAt),
  };
}

function fromRaw(row: RawOutboxRow): OutboxMessage {
  return OutboxMessage.restore({
    id: row.id,
    kind: row.kind,
    recipient: row.recipient,
    subject: row.subject,
    paragraphs: Array.isArray(row.paragraphs) ? row.paragraphs.map(String) : [],
    action:
      row.action_label && row.action_path
        ? { label: row.action_label, path: row.action_path }
        : null,
    urgent: row.urgent,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: fromDbInstant(row.next_attempt_at),
    sendBy: fromDbInstant(row.send_by),
    lastError: row.last_error,
    createdAt: fromDbInstant(row.created_at),
    sentAt: row.sent_at && fromDbInstant(row.sent_at),
    // Only pending emails are claimed.
    finishedAt: null,
  });
}
