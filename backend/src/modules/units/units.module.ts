import { Module } from '@nestjs/common';
import { UNIT_REPOSITORY } from './domain/index.js';
import { PrismaUnitRepository } from './infrastructure/prisma-unit.repository.js';

@Module({
  providers: [{ provide: UNIT_REPOSITORY, useClass: PrismaUnitRepository }],
  exports: [UNIT_REPOSITORY],
})
export class UnitsModule {}
