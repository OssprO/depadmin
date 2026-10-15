import { Injectable } from '@nestjs/common';
import { translateViolations } from '../../../platform/prisma/db-errors.js';
import { fromDbMoney, fromDbMonth, toDbMonth } from '../../../platform/prisma/db-values.js';
import type { PaperSheet as SheetRow } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import {
  ConflictError,
  type Money,
  type PaperLine,
  UnitNumber,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import { PaperSheet, type PaperSheetRepository } from '../domain/index.js';

/** A line as stored in the `lines` JSON column (a type, so it is assignable to JSON). */
type StoredLine = {
  unit: number;
  ownerName: string | null;
  current: number | null;
  other: number | null;
  text: string;
};

@Injectable()
export class PrismaPaperSheetRepository implements PaperSheetRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findSheets(month?: YearMonth): Promise<PaperSheet[]> {
    const rows = await this.database.db.paperSheet.findMany({
      where: month ? { month: toDbMonth(month) } : {},
      orderBy: [{ month: 'asc' }, { fromDay: 'asc' }],
    });
    return rows.map(toSheet);
  }

  async findSheet(id: string): Promise<PaperSheet | null> {
    const row = await this.database.db.paperSheet.findUnique({ where: { id } });
    return row && toSheet(row);
  }

  saveSheets(sheets: readonly PaperSheet[]): Promise<void> {
    return translateViolations(
      () =>
        this.database.run(async () => {
          for (const sheet of sheets) {
            const { month, fromDay, source, figures, alerts, lines } = sheet.details;
            const data = {
              month: toDbMonth(month),
              fromDay,
              source,
              paperOpening: centavos(figures.opening),
              paperIncome: centavos(figures.income),
              paperExpense: centavos(figures.expense),
              paperClosing: centavos(figures.closing),
              alerts: [...alerts],
              lines: lines.map(toStoredLine),
            };
            await this.database.db.paperSheet.upsert({
              where: { id: sheet.id },
              create: { id: sheet.id, ...data },
              update: data,
            });
          }
        }),
      {
        paper_sheet_month_from_day_key: () =>
          new ConflictError('SHEET_DUPLICATED', 'Another sheet starts on that day'),
      },
    );
  }

  async removeSheet(id: string): Promise<void> {
    await this.database.db.paperSheet.delete({ where: { id } });
  }
}

const centavos = (amount: Money | null) => amount?.centavos ?? null;
const money = (amount: number | null) => (amount === null ? null : fromDbMoney(amount));

const toStoredLine = (line: PaperLine): StoredLine => ({
  unit: line.unit.value,
  ownerName: line.ownerName,
  current: centavos(line.current),
  other: centavos(line.other),
  text: line.text,
});

function toSheet(row: SheetRow): PaperSheet {
  const lines = row.lines as unknown as StoredLine[];
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
    lines: lines.map((line) => ({
      unit: UnitNumber.of(line.unit),
      ownerName: line.ownerName,
      current: money(line.current),
      other: money(line.other),
      text: line.text,
    })),
  });
}
