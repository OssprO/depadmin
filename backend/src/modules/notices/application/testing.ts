// In-memory adapters for the notices use case specs. Excluded from the build.
import type { Instant } from '../../../shared-kernel/index.js';
import { Notice, type NoticeRepository } from '../domain/index.js';

export class InMemoryNoticeRepository implements NoticeRepository {
  readonly rows = new Map<string, Notice>();
  /** By user: the ids read, and when. */
  readonly reads = new Map<string, Map<string, Instant>>();

  add(notice: Notice): Promise<void> {
    this.rows.set(notice.id, copy(notice));
    return Promise.resolve();
  }

  findById(id: string): Promise<Notice | null> {
    const notice = this.rows.get(id);
    return Promise.resolve(notice ? copy(notice) : null);
  }

  save(notice: Notice): Promise<void> {
    this.rows.set(notice.id, copy(notice));
    return Promise.resolve();
  }

  listPublished(): Promise<Notice[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((notice) => !notice.withdrawn)
        .sort((a, b) => b.publishedAt.epochMillis - a.publishedAt.epochMillis)
        .map(copy),
    );
  }

  readBy(userId: string): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.reads.get(userId)?.keys()));
  }

  markRead(userId: string, ids: readonly string[], at: Instant): Promise<void> {
    const read = this.reads.get(userId) ?? new Map<string, Instant>();
    for (const id of ids) {
      if (this.rows.get(id)?.withdrawn === null && !read.has(id)) read.set(id, at);
    }
    this.reads.set(userId, read);
    return Promise.resolve();
  }
}

/** Stored copies, so a use case that forgets to save is caught. */
const copy = (notice: Notice) =>
  Notice.restore({
    id: notice.id,
    title: notice.title,
    body: notice.body,
    expiresOn: notice.expiresOn,
    author: notice.author,
    publishedAt: notice.publishedAt,
    withdrawn: notice.withdrawn,
  });
