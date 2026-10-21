import { Global, Module } from '@nestjs/common';
import { AUDIT_TRAIL } from '../../shared-kernel/index.js';
import { ListAuditLog } from './application/index.js';
import { AUDIT_LOG_READER } from './domain/index.js';
import { AuditLogController } from './http/audit-log.controller.js';
import { PrismaAuditLogReader } from './infrastructure/prisma-audit-log.reader.js';
import { PrismaAuditTrail } from './infrastructure/prisma-audit-trail.js';

/**
 * Global, like the unit of work: every module's write use cases inject `AUDIT_TRAIL` (a
 * shared-kernel port) without importing this module.
 */
@Global()
@Module({
  controllers: [AuditLogController],
  providers: [
    { provide: AUDIT_TRAIL, useClass: PrismaAuditTrail },
    { provide: AUDIT_LOG_READER, useClass: PrismaAuditLogReader },
    ListAuditLog,
  ],
  exports: [AUDIT_TRAIL],
})
export class AuditModule {}
