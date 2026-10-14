import { Module } from '@nestjs/common';
import { ShiftsModule } from '../shifts/shifts.module.js';
import {
  AddMovement,
  CashbookAccess,
  ReadCashbook,
  RecordCleaningVisits,
  RemoveMovement,
  ReviseMovement,
} from './application/index.js';
import { CASH_MOVEMENT_REPOSITORY } from './domain/index.js';
import { MovementsController } from './http/movements.controller.js';
import { PrismaCashMovementRepository } from './infrastructure/prisma-cash-movement.repository.js';

@Module({
  // Who may write a month comes from the shift calendar.
  imports: [ShiftsModule],
  controllers: [MovementsController],
  providers: [
    { provide: CASH_MOVEMENT_REPOSITORY, useClass: PrismaCashMovementRepository },
    CashbookAccess,
    AddMovement,
    ReviseMovement,
    RemoveMovement,
    RecordCleaningVisits,
    ReadCashbook,
  ],
  exports: [ReadCashbook],
})
export class CashbookModule {}
