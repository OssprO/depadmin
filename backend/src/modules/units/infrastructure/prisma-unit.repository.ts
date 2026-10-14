import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { fromDbMonth, toDbMonth } from '../../../platform/prisma/db-values.js';
import type {
  UnitInactivePeriod,
  Unit as UnitRow,
} from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import { UnitNumber, YearMonthRange } from '../../../shared-kernel/index.js';
import { Unit, type UnitRepository } from '../domain/index.js';

@Injectable()
export class PrismaUnitRepository implements UnitRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findAll(): Promise<Unit[]> {
    const rows = await this.database.db.unit.findMany({
      include: { inactivePeriods: true },
      orderBy: { number: 'asc' },
    });
    return rows.map(toDomain);
  }

  async findByNumber(number: UnitNumber): Promise<Unit | null> {
    const row = await this.database.db.unit.findUnique({
      where: { number: number.value },
      include: { inactivePeriods: true },
    });
    return row && toDomain(row);
  }

  /** The history is small, so it is replaced as a whole. */
  save(unit: Unit): Promise<void> {
    return this.database.run(async () => {
      const { db } = this.database;
      const number = unit.number.value;
      const ownerName = unit.ownerName;
      await db.unit.upsert({
        where: { number },
        create: { number, ownerName },
        update: { ownerName },
      });
      await db.unitInactivePeriod.deleteMany({ where: { unitNumber: number } });
      await db.unitInactivePeriod.createMany({
        data: unit.inactivePeriods.map((period) => ({
          id: randomUUID(),
          unitNumber: number,
          fromMonth: toDbMonth(period.from),
          toMonth: period.to && toDbMonth(period.to),
        })),
      });
    });
  }
}

function toDomain(row: UnitRow & { inactivePeriods: readonly UnitInactivePeriod[] }): Unit {
  return Unit.restore(
    UnitNumber.of(row.number),
    row.inactivePeriods.map((p) =>
      p.toMonth
        ? YearMonthRange.between(fromDbMonth(p.fromMonth), fromDbMonth(p.toMonth))
        : YearMonthRange.startingAt(fromDbMonth(p.fromMonth)),
    ),
    row.ownerName,
  );
}
