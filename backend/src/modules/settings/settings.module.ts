import { Module } from '@nestjs/common';
import { GetRates, RecordEarlierRates } from './application/index.js';
import { RATE_SETTINGS_REPOSITORY } from './domain/index.js';
import { PrismaRateSettingsRepository } from './infrastructure/prisma-rate-settings.repository.js';

@Module({
  providers: [
    { provide: RATE_SETTINGS_REPOSITORY, useClass: PrismaRateSettingsRepository },
    GetRates,
    RecordEarlierRates,
  ],
  exports: [GetRates, RecordEarlierRates],
})
export class SettingsModule {}
