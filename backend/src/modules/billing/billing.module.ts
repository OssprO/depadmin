import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { ChargeShiftSkipPenalties, WithdrawShiftSkipPenalties } from './application/index.js';
import { CHARGE_REPOSITORY } from './domain/index.js';
import { PrismaChargeRepository } from './infrastructure/prisma-charge.repository.js';

@Module({
  imports: [SettingsModule],
  providers: [
    { provide: CHARGE_REPOSITORY, useClass: PrismaChargeRepository },
    ChargeShiftSkipPenalties,
    WithdrawShiftSkipPenalties,
  ],
  exports: [ChargeShiftSkipPenalties, WithdrawShiftSkipPenalties],
})
export class BillingModule {}
