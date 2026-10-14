import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { UnitsModule } from '../units/units.module.js';
import {
  ChargeMaintenanceFees,
  ChargeShiftSkipPenalties,
  GetAccountStatements,
  ListOpeningBalances,
  ReplaceOpeningBalance,
  WithdrawShiftSkipPenalties,
} from './application/index.js';
import { CHARGE_REPOSITORY, OPENING_CREDIT_REPOSITORY } from './domain/index.js';
import { PrismaChargeRepository } from './infrastructure/prisma-charge.repository.js';
import { PrismaOpeningCreditRepository } from './infrastructure/prisma-opening-credit.repository.js';

@Module({
  imports: [SettingsModule, UnitsModule],
  providers: [
    { provide: CHARGE_REPOSITORY, useClass: PrismaChargeRepository },
    { provide: OPENING_CREDIT_REPOSITORY, useClass: PrismaOpeningCreditRepository },
    ChargeMaintenanceFees,
    ChargeShiftSkipPenalties,
    WithdrawShiftSkipPenalties,
    GetAccountStatements,
    ListOpeningBalances,
    ReplaceOpeningBalance,
  ],
  exports: [
    ChargeMaintenanceFees,
    ChargeShiftSkipPenalties,
    WithdrawShiftSkipPenalties,
    GetAccountStatements,
    ListOpeningBalances,
    ReplaceOpeningBalance,
  ],
})
export class BillingModule {}
