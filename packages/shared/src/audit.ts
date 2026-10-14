import { z } from 'zod';
import { roleSchema } from './auth.js';

export const AUDIT_LOG_PAGE_LIMIT_MAX = 100;

/** `GET /api/audit-log` query string. Every filter is optional. */
export const auditLogQuerySchema = z.object({
  /** The kind of entity, e.g. `user`. */
  entity: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,39}$/)
    .optional(),
  /** The history of one row. */
  entityId: z.string().min(1).max(64).optional(),
  /** Who acted: `superadmin`, or a depto number such as `501`. */
  actor: z
    .union([
      z.literal('superadmin'),
      z
        .string()
        .regex(/^\d{3}$/)
        .transform(Number),
    ])
    .optional(),
  /** The previous page's `nextCursor`. */
  before: z
    .string()
    .regex(/^[1-9]\d{0,17}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_LOG_PAGE_LIMIT_MAX).optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type AuditValue = z.infer<typeof auditValueSchema>;

/** A changed field. Secrets (passwords) only say that they changed. */
export const fieldChangeSchema = z.union([
  z.object({ field: z.string(), before: auditValueSchema, after: auditValueSchema }),
  z.object({ field: z.string(), redacted: z.literal(true) }),
]);
export type FieldChange = z.infer<typeof fieldChangeSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string(),
  occurredAt: z.iso.datetime(),
  /** Who acted, as it was then. `unit` is the owner's depto; null for the superadmin. */
  actor: z.object({ role: roleSchema, unit: z.number().int().nullable() }),
  /** A stable code, e.g. `USER_PASSWORD_RESET`. */
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  /** How a person recognizes the entity, e.g. "502". */
  entityLabel: z.string(),
  changes: z.array(fieldChangeSchema),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditLogPageSchema = z.object({
  /** Newest first. */
  entries: z.array(auditLogEntrySchema),
  /** Pass as `before` for the next page; null on the last one. */
  nextCursor: z.string().nullable(),
});
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;
