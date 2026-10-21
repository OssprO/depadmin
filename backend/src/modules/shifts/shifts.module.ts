import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { UnitsModule } from '../units/units.module.js';
import {
  CancelDelegation,
  DelegateShift,
  GetShiftCalendar,
  LoadShiftCalendar,
} from './application/index.js';
import { SHIFT_DELEGATION_REPOSITORY } from './domain/index.js';
import { ShiftsController } from './http/shifts.controller.js';
import { PrismaShiftDelegationRepository } from './infrastructure/prisma-shift-delegation.repository.js';

@Module({
  imports: [UnitsModule, BillingModule],
  controllers: [ShiftsController],
  providers: [
    { provide: SHIFT_DELEGATION_REPOSITORY, useClass: PrismaShiftDelegationRepository },
    LoadShiftCalendar,
    GetShiftCalendar,
    DelegateShift,
    CancelDelegation,
  ],
  // Other modules learn who answers for a month (write windows) through the calendar.
  exports: [LoadShiftCalendar],
})
export class ShiftsModule {}
