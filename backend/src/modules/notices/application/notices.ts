import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  creationOf,
  NotFoundError,
  OUTBOX,
  type Outbox,
  SHIFT_ROSTER,
  type ShiftRoster,
  trackChanges,
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../shared-kernel/index.js';
import { EmailRecipients } from '../../identity/application/index.js';
import {
  assertSpeaksForBuilding,
  Notice,
  type NoticeContent,
  NOTICE_REPOSITORY,
  type NoticeRepository,
  speaksForBuilding,
} from '../domain/index.js';
import { NOTICE_AUDIT, NoticeAuditAction } from './notice-audit.js';
import { noticeEmail } from './notice-email.js';

/**
 * The shift administrator or the superadmin publishes a notice (ADR-0034), audited, and it
 * goes by email to every address that wants notices, except the author's. Its author has
 * read it already.
 */
@Injectable()
export class PublishNotice {
  constructor(
    @Inject(NOTICE_REPOSITORY) private readonly notices: NoticeRepository,
    @Inject(SHIFT_ROSTER) private readonly roster: ShiftRoster,
    private readonly recipients: EmailRecipients,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, content: NoticeContent): Promise<Notice> {
    const today = this.clock.today();
    const now = this.clock.now();
    const responsibility = await this.roster.responsibilityFor(today.yearMonth);
    const author = assertSpeaksForBuilding(actor, today, responsibility);
    const notice = Notice.publish(randomUUID(), content, author, today, now);
    return this.unitOfWork.run(async () => {
      await this.notices.add(notice);
      await this.notices.markRead(actor.userId, [notice.id], now);
      await this.audit.record(actor, creationOf(NOTICE_AUDIT, NoticeAuditAction.PUBLISHED, notice));
      for (const recipient of await this.recipients.of('NOTICES', actor.userId)) {
        await this.outbox.enqueue(noticeEmail(notice, recipient, today, now));
      }
      return notice;
    });
  }
}

/** The same two take a notice back; it disappears for everyone, and the log keeps it. */
@Injectable()
export class WithdrawNotice {
  constructor(
    @Inject(NOTICE_REPOSITORY) private readonly notices: NoticeRepository,
    @Inject(SHIFT_ROSTER) private readonly roster: ShiftRoster,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, id: string): Promise<void> {
    const today = this.clock.today();
    assertSpeaksForBuilding(actor, today, await this.roster.responsibilityFor(today.yearMonth));
    await this.unitOfWork.run(async () => {
      const notice = await this.notices.findById(id);
      if (!notice || notice.withdrawn) {
        throw new NotFoundError('NOTICE_NOT_FOUND', `Notice ${id} does not exist`);
      }
      const tracked = trackChanges(NOTICE_AUDIT, notice);
      notice.withdraw(actor.userId, this.clock.now());
      await this.notices.save(notice);
      await this.audit.record(actor, tracked.change(NoticeAuditAction.WITHDRAWN));
    });
  }
}

/** A notice as one account sees it. */
export interface NoticeEntry {
  readonly notice: Notice;
  readonly current: boolean;
  readonly read: boolean;
}

export interface NoticeBoard {
  /** Whether the caller can publish and withdraw now. */
  readonly canPublish: boolean;
  /** Newest first. */
  readonly notices: readonly NoticeEntry[];
  /** Current notices the caller has not read. */
  readonly unread: number;
}

/** Everyone reads the notices; each account keeps its own reads. */
@Injectable()
export class ListNotices {
  constructor(
    @Inject(NOTICE_REPOSITORY) private readonly notices: NoticeRepository,
    @Inject(SHIFT_ROSTER) private readonly roster: ShiftRoster,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor): Promise<NoticeBoard> {
    const today = this.clock.today();
    const [responsibility, published, read] = await Promise.all([
      this.roster.responsibilityFor(today.yearMonth),
      this.notices.listPublished(),
      this.notices.readBy(actor.userId),
    ]);
    const notices = published.map((notice) => ({
      notice,
      current: notice.isCurrentOn(today),
      read: read.has(notice.id),
    }));
    return {
      canPublish: speaksForBuilding(actor, today, responsibility),
      notices,
      unread: notices.filter((entry) => entry.current && !entry.read).length,
    };
  }
}

/** The notices an account saw, opening _Avisos_. Reading is not audited. */
@Injectable()
export class MarkNoticesRead {
  constructor(
    @Inject(NOTICE_REPOSITORY) private readonly notices: NoticeRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(actor: Actor, ids: readonly string[]): Promise<void> {
    return this.unitOfWork.run(() => this.notices.markRead(actor.userId, ids, this.clock.now()));
  }
}
