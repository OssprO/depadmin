import { Injectable } from '@nestjs/common';
import { fromDbMoney, fromDbMonth, toDbMonth } from '../../../platform/prisma/db-values.js';
import type { Charge as ChargeRow } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import { UnitNumber, type YearMonth } from '../../../shared-kernel/index.js';
import { Charge, type ChargeRepository } from '../domain/index.js';

@Injectable()
export class PrismaChargeRepository implements ChargeRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findAll(): Promise<Charge[]> {
    const rows = await this.database.db.charge.findMany();
    return rows.map(toDomain);
  }

  async findByUnit(unit: UnitNumber): Promise<Charge[]> {
    const rows = await this.database.db.charge.findMany({ where: { unitNumber: unit.value } });
    return rows.map(toDomain);
  }

  async findByMonth(month: YearMonth): Promise<Charge[]> {
    const rows = await this.database.db.charge.findMany({ where: { month: toDbMonth(month) } });
    return rows.map(toDomain);
  }

  save(charges: readonly Charge[]): Promise<void> {
    return this.database.run(async () => {
      for (const charge of charges) {
        const key = keyOf(charge);
        await this.database.db.charge.upsert({
          where: { unitNumber_month_type: key },
          create: { ...key, amount: charge.amount.centavos },
          update: { amount: charge.amount.centavos },
        });
      }
    });
  }

  async remove(charges: readonly Charge[]): Promise<void> {
    if (charges.length === 0) return;
    await this.database.db.charge.deleteMany({ where: { OR: charges.map(keyOf) } });
  }
}

function keyOf(charge: Charge) {
  return { unitNumber: charge.unit.value, month: toDbMonth(charge.month), type: charge.type };
}

function toDomain(row: ChargeRow): Charge {
  return Charge.create(
    UnitNumber.of(row.unitNumber),
    fromDbMonth(row.month),
    row.type,
    fromDbMoney(row.amount),
  );
}
