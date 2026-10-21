import type { FieldChange, Instant, UnitNumber } from '../../../shared-kernel/index.js';

/** Who acted, as the log froze it: the role, and the depto for an owner or a reader. */
export type AuditActor =
  | { readonly role: 'SUPERADMIN' }
  | { readonly role: 'OWNER'; readonly unit: UnitNumber }
  | { readonly role: 'READER'; readonly unit: UnitNumber | null }
  | { readonly role: 'SYSTEM' };

/** One recorded change, as read back from the log. */
export interface AuditLogEntry {
  /** Increases with every entry, so it orders the log and serves as a page cursor. */
  readonly id: string;
  readonly occurredAt: Instant;
  readonly actor: AuditActor;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly entityLabel: string;
  readonly changes: readonly FieldChange[];
}

export interface AuditLogFilter {
  readonly entity?: string | undefined;
  /** The history of one row. */
  readonly entityId?: string | undefined;
  /** `SUPERADMIN`, `SYSTEM` (scheduled jobs), or the depto whose owner acted. */
  readonly actor?: 'SUPERADMIN' | 'SYSTEM' | UnitNumber | undefined;
}

export interface AuditLogPageRequest {
  /** Return entries older than this cursor (a previous page's `nextCursor`). */
  readonly before?: string | undefined;
  readonly limit: number;
}

export interface AuditLogPage {
  /** Newest first. */
  readonly entries: readonly AuditLogEntry[];
  /** Pass as `before` to get the next page; null when there are no more entries. */
  readonly nextCursor: string | null;
}

export const AUDIT_LOG_PAGE_SIZE = 30;
export const AUDIT_LOG_MAX_PAGE_SIZE = 100;

/** Port: reads the log. Writing goes through `AuditTrail`, in the shared kernel. */
export interface AuditLogReader {
  page(filter: AuditLogFilter, page: AuditLogPageRequest): Promise<AuditLogPage>;
}

export const AUDIT_LOG_READER = Symbol('AuditLogReader');
