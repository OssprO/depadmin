import { Injectable } from '@nestjs/common';
import { fromDbDate, fromDbMoney, toDbDate } from '../../../platform/prisma/db-values.js';
import type { CashMovement as MovementRow } from '../../../platform/prisma/generated/client.js';
import { translateViolations } from '../../../platform/prisma/db-errors.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import {
  ConflictError,
  LocalDate,
  UnitNumber,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { CashMovement, type CashMovementRepository } from '../domain/index.js';

@Injectable()
export class PrismaCashMovementRepository implements CashMovementRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findById(id: string): Promise<CashMovement | null> {
    const row = await this.database.db.cashMovement.findUnique({ where: { id } });
    return row && toDomain(row);
  }

  findByMonth(month: YearMonth): Promise<CashMovement[]> {
    return this.findBetween(LocalDate.firstOf(month), LocalDate.lastOf(month));
  }

  async findBetween(first: LocalDate, last: LocalDate): Promise<CashMovement[]> {
    const rows = await this.database.db.cashMovement.findMany({
      where: { date: { gte: toDbDate(first), lte: toDbDate(last) } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async findGarbageForWeeks(first: LocalDate, last: LocalDate): Promise<CashMovement[]> {
    const rows = await this.database.db.cashMovement.findMany({
      where: {
        category: 'GARBAGE',
        removedAt: null,
        coversWeek: { gte: toDbDate(first), lte: toDbDate(last) },
      },
      orderBy: [{ coversWeek: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async findPaymentsOf(unit: UnitNumber): Promise<CashMovement[]> {
    const rows = await this.database.db.cashMovement.findMany({
      where: { category: 'UNIT_PAYMENT', unitNumber: unit.value, removedAt: null },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async findAllPayments(): Promise<CashMovement[]> {
    const rows = await this.database.db.cashMovement.findMany({
      where: { category: 'UNIT_PAYMENT', removedAt: null },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDomain);
  }

  save(movements: readonly CashMovement[]): Promise<void> {
    return translateViolations(() => this.saveRows(movements), {
      cash_movement_one_garbage_per_week: () =>
        new ConflictError('GARBAGE_WEEK_PAID', 'Another row paid that week at the same time'),
    });
  }

  private saveRows(movements: readonly CashMovement[]): Promise<void> {
    return this.database.run(async () => {
      const { db } = this.database;
      for (const movement of movements) {
        const { date, category, amount, description, unit, week } = movement.details;
        const existing = await db.cashMovement.findUnique({ where: { id: movement.id } });
        const data = {
          date: toDbDate(date),
          category,
          amount: amount.centavos,
          description,
          unitNumber: unit?.value ?? null,
          coversWeek: week && toDbDate(week),
          // Keep the original removal time.
          removedAt: movement.isRemoved ? (existing?.removedAt ?? new Date()) : null,
        };
        await db.cashMovement.upsert({
          where: { id: movement.id },
          create: { id: movement.id, ...data },
          update: data,
        });
      }
    });
  }
}

function toDomain(row: MovementRow): CashMovement {
  return CashMovement.restore(
    row.id,
    {
      date: fromDbDate(row.date),
      category: row.category,
      amount: fromDbMoney(row.amount),
      description: row.description,
      unit: row.unitNumber === null ? null : UnitNumber.of(row.unitNumber),
      week: row.coversWeek && fromDbDate(row.coversWeek),
    },
    row.removedAt !== null,
  );
}
