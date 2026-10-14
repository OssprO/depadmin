import { Inject, Injectable } from '@nestjs/common';
import { UnitNumber, ValidationError } from '../../../shared-kernel/index.js';
import {
  AUDIT_LOG_MAX_PAGE_SIZE,
  AUDIT_LOG_PAGE_SIZE,
  AUDIT_LOG_READER,
  type AuditLogFilter,
  type AuditLogPage,
  type AuditLogReader,
} from '../domain/index.js';

/** Cursors are entry ids, which are positive 64-bit integers. */
const CURSOR = /^[1-9]\d{0,17}$/;

export interface AuditLogQuery {
  readonly entity?: string | undefined;
  readonly entityId?: string | undefined;
  /** `superadmin`, or a depto number such as 501. */
  readonly actor?: 'superadmin' | number | undefined;
  readonly before?: string | undefined;
  readonly limit?: number | undefined;
}

/**
 * A page of the audit log, newest first. Every signed-in user may read it: owners have
 * full read access (spec 5), and the log holds no secrets (passwords are redacted).
 */
@Injectable()
export class ListAuditLog {
  constructor(@Inject(AUDIT_LOG_READER) private readonly reader: AuditLogReader) {}

  execute(query: AuditLogQuery): Promise<AuditLogPage> {
    const { entity, entityId, actor, before, limit = AUDIT_LOG_PAGE_SIZE } = query;
    if (before !== undefined && !CURSOR.test(before)) {
      throw new ValidationError('AUDIT_CURSOR_INVALID', `Invalid cursor "${before}"`);
    }
    return this.reader.page(
      { entity, entityId, actor: actorFilter(actor) },
      { before, limit: Math.min(Math.max(1, limit), AUDIT_LOG_MAX_PAGE_SIZE) },
    );
  }
}

function actorFilter(actor: AuditLogQuery['actor']): AuditLogFilter['actor'] {
  if (actor === undefined) return undefined;
  return actor === 'superadmin' ? 'SUPERADMIN' : UnitNumber.of(actor);
}
