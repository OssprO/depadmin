import { Module } from '@nestjs/common';
import { ConfigModule } from './platform/config/config.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { LoggerModule } from './platform/logger/logger.module.js';

@Module({
  imports: [ConfigModule, LoggerModule, HealthModule],
})
export class AppModule {}
