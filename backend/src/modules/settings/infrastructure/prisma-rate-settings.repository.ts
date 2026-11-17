import { Injectable } from '@nestjs/common';
import { fromDbDate, fromDbMoney, toDbDate } from '../../../platform/prisma/db-values.js';
import { RateName as DbRateName } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import {
  type RateChange,
  type RateName,
  RATE_NAMES,
  RateSettings,
  type RateSettingsRepository,
} from '../domain/index.js';

const DB_NAMES: Readonly<Record<RateName, DbRateName>> = {
  maintenanceFee: DbRateName.MAINTENANCE_FEE,
  cleaningPerVisit: DbRateName.CLEANING_PER_VISIT,
  garbageWeekly: DbRateName.GARBAGE_WEEKLY,
  shiftSkipPenalty: DbRateName.SHIFT_SKIP_PENALTY,
};

@Injectable()
export class PrismaRateSettingsRepository implements RateSettingsRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async load(): Promise<RateSettings | null> {
    const { db } = this.database;
    // Outside a unit of work the lock is released as soon as it is taken: harmless.
    await db.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext('rate_change'))`;
    const rows = await db.rateChange.findMany();
    if (rows.length === 0) return null;
    const historyOf = (name: RateName): RateChange[] =>
      rows
        .filter((row) => row.rate === DB_NAMES[name])
        .map((row) => ({
          effectiveFrom: fromDbDate(row.effectiveFrom),
          amount: fromDbMoney(row.amount),
          agreement:
            row.agreedOn && row.agreement !== null
              ? { on: fromDbDate(row.agreedOn), summary: row.agreement }
              : null,
        }));
    return RateSettings.restore({
      maintenanceFee: historyOf('maintenanceFee'),
      cleaningPerVisit: historyOf('cleaningPerVisit'),
      garbageWeekly: historyOf('garbageWeekly'),
      shiftSkipPenalty: historyOf('shiftSkipPenalty'),
    });
  }

  save(settings: RateSettings): Promise<void> {
    return this.database.run(async () => {
      const { db } = this.database;
      const stored = await db.rateChange.findMany({ select: { rate: true, effectiveFrom: true } });
      const key = (rate: DbRateName, date: Date) => `${rate} ${date.toISOString()}`;
      const kept = new Set(
        RATE_NAMES.flatMap((name) =>
          settings
            .historyOf(name)
            .map((change) => key(DB_NAMES[name], toDbDate(change.effectiveFrom))),
        ),
      );
      const removed = stored.filter((row) => !kept.has(key(row.rate, row.effectiveFrom)));
      for (const row of removed) {
        await db.rateChange.delete({
          where: { rate_effectiveFrom: { rate: row.rate, effectiveFrom: row.effectiveFrom } },
        });
      }
      await db.rateChange.createMany({
        data: RATE_NAMES.flatMap((name) =>
          settings.historyOf(name).map((change) => ({
            rate: DB_NAMES[name],
            effectiveFrom: toDbDate(change.effectiveFrom),
            amount: change.amount.centavos,
            agreedOn: change.agreement ? toDbDate(change.agreement.on) : null,
            agreement: change.agreement?.summary ?? null,
          })),
        ),
        skipDuplicates: true,
      });
    });
  }

  /** A transaction-level advisory lock; `load` takes its shared side. */
  async lock(): Promise<void> {
    await this.database.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rate_change'))`;
  }
}
