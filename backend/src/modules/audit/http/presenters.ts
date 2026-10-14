import type {
  AuditLogEntry as AuditLogEntryResponse,
  AuditLogPage as AuditLogPageResponse,
} from '@depadmin/shared';
import type { AuditLogEntry, AuditLogPage } from '../domain/index.js';

export function toAuditLogPage(page: AuditLogPage): AuditLogPageResponse {
  return { entries: page.entries.map(toAuditLogEntry), nextCursor: page.nextCursor };
}

function toAuditLogEntry(entry: AuditLogEntry): AuditLogEntryResponse {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt.toString(),
    actor: {
      role: entry.actor.role,
      unit: entry.actor.role === 'OWNER' ? entry.actor.unit.value : null,
    },
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    changes: entry.changes.map((change) => ({ ...change })),
  };
}
