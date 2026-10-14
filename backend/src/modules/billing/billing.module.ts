import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { UnitsModule } from '../units/units.module.js';
import {
  ChargeMaintenanceFees,
  ChargeShiftSkipPenalties,
  GetAccountStatements,
  WithdrawShiftSkipPenalties,
} from './application/index.js';
import { CHARGE_REPOSITORY } from './domain/index.js';
import { PrismaChargeRepository } from './infrastructure/prisma-charge.repository.js';

@Module({
  imports: [SettingsModule, UnitsModule],
  providers: [
    { provide: CHARGE_REPOSITORY, useClass: PrismaChargeRepository },
    ChargeMaintenanceFees,
    ChargeShiftSkipPenalties,
    WithdrawShiftSkipPenalties,
    GetAccountStatements,
  ],
  exports: [
    ChargeMaintenanceFees,
    ChargeShiftSkipPenalties,
    WithdrawShiftSkipPenalties,
    GetAccountStatements,
  ],
})
export class BillingModule {}
