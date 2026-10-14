import { Inject, Injectable } from '@nestjs/common';
import { toDbInstant } from '../../../platform/prisma/db-values.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import {
  type AuditedChange,
  type AuditTrail,
  type ChangeAuthor,
  CLOCK,
  type Clock,
} from '../../../shared-kernel/index.js';

/**
 * Writes audit entries in the caller's transaction. It refuses to write outside one: an
 * entry committed on its own could describe a change that was then rolled back, or the
 * change could be saved while its entry failed.
 */
@Injectable()
export class PrismaAuditTrail implements AuditTrail {
  constructor(
    private readonly database: PrismaDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async record(actor: ChangeAuthor, change: AuditedChange): Promise<void> {
    if (!this.database.inTransaction) {
      throw new Error(`Audit entry ${change.action} written outside a unit of work`);
    }
    await this.database.db.auditLog.create({
      data: {
        occurredAt: toDbInstant(this.clock.now()),
        actorId: actor.userId,
        actorRole: actor.role,
        actorUnit: actor.role === 'OWNER' ? actor.unit.value : null,
        action: change.action,
        entity: change.entity,
        entityId: change.entityId,
        entityLabel: change.entityLabel,
        changes: change.changes.map((c) => ({ ...c })),
      },
    });
  }
}
