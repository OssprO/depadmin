import { Controller, Get, Query } from '@nestjs/common';
import { type AuditLogPage, type AuditLogQuery, auditLogQuerySchema } from '@depadmin/shared';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { ListAuditLog } from '../application/index.js';
import { toAuditLogPage } from './presenters.js';

/** The audit log, read-only. Entries are written by the use cases, never through HTTP. */
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly listAuditLog: ListAuditLog) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogPage> {
    return toAuditLogPage(await this.listAuditLog.execute(query));
  }
}
