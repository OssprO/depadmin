import { Injectable } from '@nestjs/common';
import { fromDbInstant } from '../../../platform/prisma/db-values.js';
import type { AuditLog as AuditLogRow, Prisma } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import { type FieldChange, UnitNumber } from '../../../shared-kernel/index.js';
import type {
  AuditActor,
  AuditLogEntry,
  AuditLogFilter,
  AuditLogPage,
  AuditLogPageRequest,
  AuditLogReader,
} from '../domain/index.js';

/**
 * Keyset pagination on the id, newest first. Unlike an offset, a cursor does not shift when
 * new entries arrive while someone is paging through the log.
 */
@Injectable()
export class PrismaAuditLogReader implements AuditLogReader {
  constructor(private readonly database: PrismaDatabase) {}

  async page(filter: AuditLogFilter, page: AuditLogPageRequest): Promise<AuditLogPage> {
    const rows = await this.database.db.auditLog.findMany({
      where: {
        ...whereFilter(filter),
        ...(page.before !== undefined && { id: { lt: BigInt(page.before) } }),
      },
      orderBy: { id: 'desc' },
      // One extra row tells whether there is a next page.
      take: page.limit + 1,
    });
    const entries = rows.slice(0, page.limit).map(toEntry);
    return {
      entries,
      nextCursor: rows.length > page.limit ? (entries.at(-1)?.id ?? null) : null,
    };
  }
}

function whereFilter({ entity, entityId, actor }: AuditLogFilter): Prisma.AuditLogWhereInput {
  return {
    ...(entity !== undefined && { entity }),
    ...(entityId !== undefined && { entityId }),
    ...((actor === 'SUPERADMIN' || actor === 'SYSTEM') && { actorRole: actor }),
    ...(actor instanceof UnitNumber && { actorRole: 'OWNER', actorUnit: actor.value }),
  };
}

function toEntry(row: AuditLogRow): AuditLogEntry {
  // A CHECK guarantees that an owner, and only an owner, has a depto.
  const actor: AuditActor =
    row.actorRole === 'OWNER'
      ? { role: 'OWNER', unit: UnitNumber.of(row.actorUnit ?? 0) }
      : { role: row.actorRole };
  return {
    id: row.id.toString(),
    occurredAt: fromDbInstant(row.occurredAt),
    actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    // Written only by PrismaAuditTrail, from FieldChange values; a CHECK keeps it an array.
    changes: row.changes as unknown as FieldChange[],
  };
}
