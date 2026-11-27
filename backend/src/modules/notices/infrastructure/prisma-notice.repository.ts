import { Injectable } from '@nestjs/common';
import {
  fromDbDate,
  fromDbInstant,
  toDbDate,
  toDbInstant,
} from '../../../platform/prisma/db-values.js';
import type { Notice as NoticeRow } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import { type Instant, UnitNumber } from '../../../shared-kernel/index.js';
import { Notice, type NoticeAuthor, type NoticeRepository } from '../domain/index.js';

@Injectable()
export class PrismaNoticeRepository implements NoticeRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async add(notice: Notice): Promise<void> {
    const { author } = notice;
    await this.database.db.notice.create({
      data: {
        id: notice.id,
        title: notice.title,
        body: notice.body,
        expiresOn: notice.expiresOn && toDbDate(notice.expiresOn),
        authorId: author.userId,
        authorRole: author.role,
        authorUnit: author.role === 'OWNER' ? author.unit.value : null,
        publishedAt: toDbInstant(notice.publishedAt),
      },
    });
  }

  async findById(id: string): Promise<Notice | null> {
    const row = await this.database.db.notice.findUnique({ where: { id } });
    return row && toDomain(row);
  }

  /** Only a withdrawal changes a notice. */
  async save(notice: Notice): Promise<void> {
    const { withdrawn } = notice;
    await this.database.db.notice.update({
      where: { id: notice.id },
      data: {
        withdrawnAt: withdrawn && toDbInstant(withdrawn.at),
        withdrawnBy: withdrawn?.by ?? null,
      },
    });
  }

  async listPublished(): Promise<Notice[]> {
    const rows = await this.database.db.notice.findMany({
      where: { withdrawnAt: null },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async readBy(userId: string): Promise<ReadonlySet<string>> {
    const rows = await this.database.db.noticeRead.findMany({
      where: { userId },
      select: { noticeId: true },
    });
    return new Set(rows.map((row) => row.noticeId));
  }

  async markRead(userId: string, ids: readonly string[], at: Instant): Promise<void> {
    if (ids.length === 0) return;
    // Only notices that exist and stand; a read already recorded keeps its first time.
    await this.database.db.$executeRaw`
      INSERT INTO notice_read (notice_id, user_id, read_at)
      SELECT id, ${userId}::uuid, ${toDbInstant(at)} FROM notice
      WHERE id = ANY(${[...ids]}::uuid[]) AND withdrawn_at IS NULL
      ON CONFLICT (notice_id, user_id) DO NOTHING`;
  }
}

function toDomain(row: NoticeRow): Notice {
  return Notice.restore({
    id: row.id,
    title: row.title,
    body: row.body,
    expiresOn: row.expiresOn && fromDbDate(row.expiresOn),
    author: authorOf(row),
    publishedAt: fromDbInstant(row.publishedAt),
    withdrawn:
      row.withdrawnAt && row.withdrawnBy
        ? { at: fromDbInstant(row.withdrawnAt), by: row.withdrawnBy }
        : null,
  });
}

function authorOf(row: NoticeRow): NoticeAuthor {
  // The database allows no other: a reader never publishes, and an owner has its depto.
  return row.authorRole === 'OWNER' && row.authorUnit !== null
    ? { role: 'OWNER', userId: row.authorId, unit: UnitNumber.of(row.authorUnit) }
    : { role: 'SUPERADMIN', userId: row.authorId };
}
