import type { Actor } from './actor.js';

/** A field value as the audit log stores it: JSON scalars only. */
export type AuditValue = string | number | boolean | null;

/**
 * A field whose value must never reach the log, such as a password hash. The log records
 * only that it changed: the values are compared in memory and then dropped.
 */
export class Redacted {
  constructor(readonly value: unknown) {}
}

/** An entity's audited fields at one moment. */
export type AuditSnapshot = Readonly<Record<string, AuditValue | Redacted>>;

export type FieldChange =
  | { readonly field: string; readonly before: AuditValue; readonly after: AuditValue }
  | { readonly field: string; readonly redacted: true };

/** One change to one entity, as the use case that made it describes it. */
export interface AuditedChange {
  /** What happened, as a stable code (e.g. `USER_PASSWORD_RESET`). */
  readonly action: string;
  /** The kind of entity (e.g. `user`, `cash_movement`). */
  readonly entity: string;
  readonly entityId: string;
  /** How a person recognizes the entity (e.g. "502"), frozen as it was at the time. */
  readonly entityLabel: string;
  readonly changes: readonly FieldChange[];
}

/**
 * Port: the append-only audit log. A write use case records its changes inside the same
 * unit of work as the change itself, so either both are saved or neither is.
 */
export interface AuditTrail {
  record(actor: Actor, change: AuditedChange): Promise<void>;
}

export const AUDIT_TRAIL = Symbol('AuditTrail');

/** How one kind of entity appears in the audit log. Each module declares one per entity. */
export interface AuditSubject<T> {
  readonly entity: string;
  id(item: T): string;
  label(item: T): string;
  snapshot(item: T): AuditSnapshot;
}

/**
 * Field-by-field differences between two snapshots, in field order. `null` stands for "did
 * not exist", so a creation lists every field with `before: null`.
 */
export function diffSnapshots(
  before: AuditSnapshot | null,
  after: AuditSnapshot | null,
): FieldChange[] {
  const fields = new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})]);
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const old = before?.[field] ?? null;
    const now = after?.[field] ?? null;
    if (old instanceof Redacted || now instanceof Redacted) {
      if (revealed(old) !== revealed(now)) changes.push({ field, redacted: true });
    } else if (old !== now) {
      changes.push({ field, before: old, after: now });
    }
  }
  return changes;
}

const revealed = (value: AuditValue | Redacted): unknown =>
  value instanceof Redacted ? value.value : value;

/**
 * Remembers an entity's state before a use case changes it, so the change can be described
 * afterwards in one call:
 *
 *     const tracked = trackChanges(USER_AUDIT, user);
 *     user.resetPassword(hash);
 *     await unitOfWork.run(async () => {
 *       await users.save(user);
 *       await audit.record(actor, tracked.change('USER_PASSWORD_RESET'));
 *     });
 */
export function trackChanges<T>(subject: AuditSubject<T>, item: T) {
  const before = subject.snapshot(item);
  return {
    /** Describes the change from the remembered state to `after` (by default, the same mutated item). */
    change(action: string, after: T = item): AuditedChange {
      return describe(subject, action, after, before, subject.snapshot(after));
    },
  };
}

/** Describes a new entity: every field, from nothing. */
export function creationOf<T>(subject: AuditSubject<T>, action: string, item: T): AuditedChange {
  return describe(subject, action, item, null, subject.snapshot(item));
}

function describe<T>(
  subject: AuditSubject<T>,
  action: string,
  item: T,
  before: AuditSnapshot | null,
  after: AuditSnapshot,
): AuditedChange {
  return {
    action,
    entity: subject.entity,
    entityId: subject.id(item),
    entityLabel: subject.label(item),
    changes: diffSnapshots(before, after),
  };
}
