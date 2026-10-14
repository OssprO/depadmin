import { Injectable } from '@nestjs/common';
import { fromDbMoney, fromDbMonth, toDbMonth } from '../../../platform/prisma/db-values.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import { UnitNumber } from '../../../shared-kernel/index.js';
import type { OpeningCredit, OpeningCreditRepository } from '../domain/index.js';

@Injectable()
export class PrismaOpeningCreditRepository implements OpeningCreditRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findAll(): Promise<OpeningCredit[]> {
    const rows = await this.database.db.openingCredit.findMany({ orderBy: { unitNumber: 'asc' } });
    return rows.map((row) => ({
      unit: UnitNumber.of(row.unitNumber),
      month: fromDbMonth(row.month),
      amount: fromDbMoney(row.amount),
    }));
  }

  async save(unit: UnitNumber, credit: OpeningCredit | null): Promise<void> {
    const { db } = this.database;
    if (!credit) {
      await db.openingCredit.deleteMany({ where: { unitNumber: unit.value } });
      return;
    }
    const data = { month: toDbMonth(credit.month), amount: credit.amount.centavos };
    await db.openingCredit.upsert({
      where: { unitNumber: unit.value },
      create: { unitNumber: unit.value, ...data },
      update: data,
    });
  }
}
