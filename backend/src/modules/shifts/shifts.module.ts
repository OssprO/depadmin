import { Module } from '@nestjs/common';
import { SHIFT_DELEGATION_REPOSITORY } from './domain/index.js';
import { PrismaShiftDelegationRepository } from './infrastructure/prisma-shift-delegation.repository.js';

@Module({
  providers: [{ provide: SHIFT_DELEGATION_REPOSITORY, useClass: PrismaShiftDelegationRepository }],
  exports: [SHIFT_DELEGATION_REPOSITORY],
})
export class ShiftsModule {}
