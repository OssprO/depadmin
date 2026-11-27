import type { Instant } from '../../../shared-kernel/index.js';
import type { Notice } from './notice.js';

export interface NoticeRepository {
  add(notice: Notice): Promise<void>;
  /** Withdrawn ones too. */
  findById(id: string): Promise<Notice | null>;
  save(notice: Notice): Promise<void>;
  /** Every notice not withdrawn, newest first. */
  listPublished(): Promise<Notice[]>;
  /** The ids of the notices `userId` has read. */
  readBy(userId: string): Promise<ReadonlySet<string>>;
  /**
   * Marks them read by `userId`; one read before keeps its first time. Ids of no notice, or
   * of a withdrawn one, are ignored.
   */
  markRead(userId: string, ids: readonly string[], at: Instant): Promise<void>;
}

export const NOTICE_REPOSITORY = Symbol('NoticeRepository');
