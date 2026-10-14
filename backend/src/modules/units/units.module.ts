import { Module } from '@nestjs/common';
import { ListUnits, SetUnitStatus } from './application/index.js';
import { UNIT_REPOSITORY } from './domain/index.js';
import { UnitsController } from './http/units.controller.js';
import { PrismaUnitRepository } from './infrastructure/prisma-unit.repository.js';

@Module({
  controllers: [UnitsController],
  providers: [
    { provide: UNIT_REPOSITORY, useClass: PrismaUnitRepository },
    ListUnits,
    SetUnitStatus,
  ],
  exports: [ListUnits],
})
export class UnitsModule {}
