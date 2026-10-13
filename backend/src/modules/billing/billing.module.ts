import { Module } from '@nestjs/common';
import { CHARGE_REPOSITORY } from './domain/index.js';
import { PrismaChargeRepository } from './infrastructure/prisma-charge.repository.js';

@Module({
  providers: [{ provide: CHARGE_REPOSITORY, useClass: PrismaChargeRepository }],
  exports: [CHARGE_REPOSITORY],
})
export class BillingModule {}
