import { Module } from '@nestjs/common';
import { AuditModule } from './modules/audit/audit.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CashbookModule } from './modules/cashbook/cashbook.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { ShiftsModule } from './modules/shifts/shifts.module.js';
import { UnitsModule } from './modules/units/units.module.js';
import { ClockModule } from './platform/clock/clock.module.js';
import { ConfigModule } from './platform/config/config.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { LoggerModule } from './platform/logger/logger.module.js';
import { PrismaModule } from './platform/prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ClockModule,
    PrismaModule,
    HealthModule,
    AuditModule,
    IdentityModule,
    UnitsModule,
    ShiftsModule,
    SettingsModule,
    CashbookModule,
    BillingModule,
    ReportsModule,
  ],
})
export class AppModule {}
