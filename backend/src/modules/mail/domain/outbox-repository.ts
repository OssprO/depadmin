import type { Instant } from '../../../shared-kernel/index.js';
import type { OutboxMessage } from './outbox-message.js';

export interface OutboxRepository {
  add(message: OutboxMessage): Promise<void>;
  /**
   * Takes up to `limit` pending emails due at `now`, urgent first and then oldest, and holds
   * them until `until`: another courier (a second API during a deploy) skips them meanwhile.
   * `urgentOnly` leaves the rest waiting.
   */
  claimDue(
    now: Instant,
    limit: number,
    until: Instant,
    urgentOnly?: boolean,
  ): Promise<OutboxMessage[]>;
  /** Stores what became of it, and releases its claim. */
  save(message: OutboxMessage): Promise<void>;
  /** Emails the provider took since `since`, for the daily limit. */
  countSentSince(since: Instant): Promise<number>;
  /** Marks `EXPIRED` the pending emails whose `sendBy` passed; returns how many. */
  expireLate(now: Instant): Promise<number>;
  countPending(): Promise<number>;
  /** Deletes what stopped being pending before `at`; returns how many. */
  deleteFinishedBefore(at: Instant): Promise<number>;
}

export const OUTBOX_REPOSITORY = Symbol('OutboxRepository');
