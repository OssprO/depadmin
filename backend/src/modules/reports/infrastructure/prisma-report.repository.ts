import { Injectable } from '@nestjs/common';
import { fromDbMoney, fromDbMonth, toDbMonth } from '../../../platform/prisma/db-values.js';
import {
  Prisma,
  type MonthlyReport as ReportRow,
} from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import type { YearMonth } from '../../../shared-kernel/index.js';
import {
  MonthlyReport,
  type ReportingStart,
  ReportLedger,
  type ReportRepository,
  type ReportSnapshot,
} from '../domain/index.js';

@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async loadLedger(): Promise<ReportLedger | null> {
    const { db } = this.database;
    const start = await db.reportingStart.findUnique({ where: { id: 1 } });
    if (!start) return null;
    const rows = await db.monthlyReport.findMany({ orderBy: { month: 'asc' } });
    return ReportLedger.restore(
      { month: fromDbMonth(start.month), openingBalance: fromDbMoney(start.openingBalance) },
      rows.map(toDomain),
    );
  }

  async saveStart(start: ReportingStart): Promise<void> {
    const data = { month: toDbMonth(start.month), openingBalance: start.openingBalance.centavos };
    await this.database.db.reportingStart.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
  }

  async lockMonth(month: YearMonth, mode: 'shared' | 'exclusive'): Promise<void> {
    const lock = Prisma.raw(mode === 'exclusive' ? 'FOR UPDATE' : 'FOR SHARE');
    await this.database.db.$queryRaw`
      SELECT 1 FROM monthly_report WHERE month = ${toDbMonth(month)} ${lock}`;
  }

  save(reports: readonly MonthlyReport[]): Promise<void> {
    return this.database.run(async () => {
      const { db } = this.database;
      for (const report of reports) {
        const month = toDbMonth(report.month);
        const existing = await db.monthlyReport.findUnique({ where: { month } });
        // Snapshot and closing time change together (a CHECK requires it). Restating an
        // already closed month keeps its original closing time.
        const data = {
          ...snapshotColumns(report.snapshot),
          closedAt: report.snapshot ? (existing?.closedAt ?? new Date()) : null,
        };
        await db.monthlyReport.upsert({
          where: { month },
          create: { month, ...data },
          update: data,
        });
      }
    });
  }
}

function snapshotColumns(snapshot: ReportSnapshot | null) {
  return {
    openingBalance: snapshot?.openingBalance.centavos ?? null,
    income: snapshot?.income.centavos ?? null,
    expense: snapshot?.expense.centavos ?? null,
    closingBalance: snapshot?.closingBalance.centavos ?? null,
  };
}

function toDomain(row: ReportRow): MonthlyReport {
  const month = fromDbMonth(row.month);
  if (row.closedAt === null) return MonthlyReport.restore(month, null);
  return MonthlyReport.restore(month, {
    openingBalance: fromDbMoney(row.openingBalance ?? 0),
    income: fromDbMoney(row.income ?? 0),
    expense: fromDbMoney(row.expense ?? 0),
    closingBalance: fromDbMoney(row.closingBalance ?? 0),
  });
}
