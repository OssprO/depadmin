import { Module } from '@nestjs/common';
import {
  ChangeRate,
  GetRates,
  GetRateSchedule,
  RecordEarlierRates,
  WithdrawRateChange,
} from './application/index.js';
import { RATE_SETTINGS_REPOSITORY } from './domain/index.js';
import { RatesController } from './http/rates.controller.js';
import { PrismaRateSettingsRepository } from './infrastructure/prisma-rate-settings.repository.js';

@Module({
  controllers: [RatesController],
  providers: [
    { provide: RATE_SETTINGS_REPOSITORY, useClass: PrismaRateSettingsRepository },
    GetRates,
    RecordEarlierRates,
    GetRateSchedule,
    ChangeRate,
    WithdrawRateChange,
  ],
  exports: [GetRates, RecordEarlierRates],
})
export class SettingsModule {}
