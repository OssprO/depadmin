import { Module } from '@nestjs/common';
import { RATE_SETTINGS_REPOSITORY } from './domain/index.js';
import { PrismaRateSettingsRepository } from './infrastructure/prisma-rate-settings.repository.js';

@Module({
  providers: [{ provide: RATE_SETTINGS_REPOSITORY, useClass: PrismaRateSettingsRepository }],
  exports: [RATE_SETTINGS_REPOSITORY],
})
export class SettingsModule {}
