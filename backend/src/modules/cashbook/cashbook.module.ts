import { Module } from '@nestjs/common';
import { CASH_MOVEMENT_REPOSITORY } from './domain/index.js';
import { PrismaCashMovementRepository } from './infrastructure/prisma-cash-movement.repository.js';

@Module({
  providers: [{ provide: CASH_MOVEMENT_REPOSITORY, useClass: PrismaCashMovementRepository }],
  exports: [CASH_MOVEMENT_REPOSITORY],
})
export class CashbookModule {}
