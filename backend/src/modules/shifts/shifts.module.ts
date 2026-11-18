import { Global, Module } from '@nestjs/common';
import { SHIFT_ROSTER } from '../../shared-kernel/index.js';
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

/**
 * Global for one thing only: the `SHIFT_ROSTER` port, which the settings module asks (only
 * the shift administrator changes the rates) without importing this one, which it is below.
 */
@Global()
@Module({
  imports: [UnitsModule, BillingModule],
  controllers: [ShiftsController],
  providers: [
    { provide: SHIFT_DELEGATION_REPOSITORY, useClass: PrismaShiftDelegationRepository },
    LoadShiftCalendar,
    { provide: SHIFT_ROSTER, useExisting: LoadShiftCalendar },
    GetShiftCalendar,
    DelegateShift,
    CancelDelegation,
  ],
  // Other modules learn who answers for a month (write windows) through the calendar.
  exports: [LoadShiftCalendar, SHIFT_ROSTER],
})
export class ShiftsModule {}
