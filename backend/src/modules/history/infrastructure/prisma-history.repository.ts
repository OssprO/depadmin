import { Injectable } from '@nestjs/common';
import { translateViolations } from '../../../platform/prisma/db-errors.js';
import {
  fromDbDate,
  fromDbInstant,
  fromDbMoney,
  fromDbMonth,
  toDbDate,
  toDbInstant,
  toDbMonth,
} from '../../../platform/prisma/db-values.js';
import type {
  HistoricalMovement as MovementRow,
  HistoricalSheet as SheetRow,
} from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import {
  ConflictError,
  LocalDate,
  type Money,
  UnitNumber,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  HistoricalBooks,
  HistoricalMovement,
  type HistoryRepository,
  PaperSheet,
} from '../domain/index.js';

const BOOKS_ID = 1;

@Injectable()
export class PrismaHistoryRepository implements HistoryRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async loadBooks(): Promise<HistoricalBooks | null> {
    const row = await this.database.db.historicalBooks.findUnique({ where: { id: BOOKS_ID } });
    return (
      row &&
      HistoricalBooks.restore(
        fromDbMonth(row.firstMonth),
        fromDbMonth(row.lastMonth),
        fromDbMoney(row.openingBalance),
        row.verifiedAt && fromDbInstant(row.verifiedAt),
      )
    );
  }

  async saveBooks(books: HistoricalBooks): Promise<void> {
    const data = {
      firstMonth: toDbMonth(books.firstMonth),
      lastMonth: toDbMonth(books.lastMonth),
      openingBalance: books.openingBalance.centavos,
      verifiedAt: books.verifiedAt && toDbInstant(books.verifiedAt),
    };
    await this.database.db.historicalBooks.upsert({
      where: { id: BOOKS_ID },
      create: { id: BOOKS_ID, ...data },
      update: data,
    });
  }

  async findSheets(month?: YearMonth): Promise<PaperSheet[]> {
    const rows = await this.database.db.historicalSheet.findMany({
      where: month ? { month: toDbMonth(month) } : {},
      orderBy: [{ month: 'asc' }, { fromDay: 'asc' }],
    });
    return rows.map(toSheet);
  }

  async findSheet(id: string): Promise<PaperSheet | null> {
    const row = await this.database.db.historicalSheet.findUnique({ where: { id } });
    return row && toSheet(row);
  }

  saveSheets(sheets: readonly PaperSheet[]): Promise<void> {
    return translateViolations(
      () =>
        this.database.run(async () => {
          for (const sheet of sheets) {
            const { month, fromDay, source, figures, alerts, notes } = sheet.details;
            const data = {
              month: toDbMonth(month),
              fromDay,
              source,
              paperOpening: centavos(figures.opening),
              paperIncome: centavos(figures.income),
              paperExpense: centavos(figures.expense),
              paperClosing: centavos(figures.closing),
              alerts: [...alerts],
              notes: notes.map((note) => ({ unit: note.unit.value, text: note.text })),
            };
            await this.database.db.historicalSheet.upsert({
              where: { id: sheet.id },
              create: { id: sheet.id, ...data },
              update: data,
            });
          }
        }),
      {
        historical_sheet_month_from_day_key: () =>
          new ConflictError('SHEET_DUPLICATED', 'Another sheet starts on that day'),
      },
    );
  }

  async removeSheet(id: string): Promise<void> {
    await this.database.db.historicalSheet.delete({ where: { id } });
  }

  async findMovements(month?: YearMonth): Promise<HistoricalMovement[]> {
    const rows = await this.database.db.historicalMovement.findMany({
      where: month
        ? {
            date: {
              gte: toDbDate(LocalDate.firstOf(month)),
              lte: toDbDate(LocalDate.lastOf(month)),
            },
          }
        : {},
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMovement);
  }

  async findMovement(id: string): Promise<HistoricalMovement | null> {
    const row = await this.database.db.historicalMovement.findUnique({ where: { id } });
    return row && toMovement(row);
  }

  async findGarbageFor(week: LocalDate): Promise<HistoricalMovement | null> {
    const row = await this.database.db.historicalMovement.findFirst({
      where: { coversWeek: toDbDate(week) },
    });
    return row && toMovement(row);
  }

  saveMovements(movements: readonly HistoricalMovement[]): Promise<void> {
    return translateViolations(
      () =>
        this.database.run(async () => {
          const { db } = this.database;
          const existing = new Set(
            (
              await db.historicalMovement.findMany({
                where: { id: { in: movements.map((movement) => movement.id) } },
                select: { id: true },
              })
            ).map((row) => row.id),
          );
          const rows = movements.map(toRow);
          // An import brings over a thousand rows, so new ones go in a single statement. A
          // millisecond apart each, so rows of the same day keep the order they came in.
          const now = Date.now();
          await db.historicalMovement.createMany({
            data: rows
              .filter((row) => !existing.has(row.id))
              .map((row, i) => ({ ...row, createdAt: new Date(now + i) })),
          });
          for (const { id, ...data } of rows.filter((r) => existing.has(r.id))) {
            await db.historicalMovement.update({ where: { id }, data });
          }
        }),
      {
        historical_movement_one_garbage_per_week: () =>
          new ConflictError('GARBAGE_WEEK_PAID', 'Another row paid that week'),
      },
    );
  }

  async removeMovement(id: string): Promise<void> {
    await this.database.db.historicalMovement.delete({ where: { id } });
  }

  discard(): Promise<void> {
    return this.database.run(async () => {
      const { db } = this.database;
      await db.historicalMovement.deleteMany();
      await db.historicalSheet.deleteMany();
      await db.historicalBooks.deleteMany();
    });
  }
}

const centavos = (amount: Money | null) => amount?.centavos ?? null;
const money = (amount: number | null) => (amount === null ? null : fromDbMoney(amount));

function toSheet(row: SheetRow): PaperSheet {
  const notes = row.notes as { unit: number; text: string }[];
  return PaperSheet.create(row.id, {
    month: fromDbMonth(row.month),
    fromDay: row.fromDay,
    source: row.source,
    figures: {
      opening: money(row.paperOpening),
      income: money(row.paperIncome),
      expense: money(row.paperExpense),
      closing: money(row.paperClosing),
    },
    alerts: row.alerts,
    notes: notes.map((note) => ({ unit: UnitNumber.of(note.unit), text: note.text })),
  });
}

function toMovement(row: MovementRow): HistoricalMovement {
  return HistoricalMovement.record(row.id, {
    date: fromDbDate(row.date),
    category: row.category,
    amount: fromDbMoney(row.amount),
    description: row.description,
    unit: row.unitNumber === null ? null : UnitNumber.of(row.unitNumber),
    week: row.coversWeek && fromDbDate(row.coversWeek),
  });
}

function toRow(movement: HistoricalMovement) {
  const { date, category, amount, description, unit, week } = movement.details;
  return {
    id: movement.id,
    date: toDbDate(date),
    category,
    amount: amount.centavos,
    description,
    unitNumber: unit?.value ?? null,
    coversWeek: week && toDbDate(week),
  };
}
