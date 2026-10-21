import { Injectable } from '@nestjs/common';
import { fromDbDate, fromDbMoney, toDbDate } from '../../../platform/prisma/db-values.js';
import { RateName as DbRateName } from '../../../platform/prisma/generated/client.js';
import { PrismaDatabase } from '../../../platform/prisma/prisma-database.js';
import {
  type RateChange,
  type RateName,
  RateSettings,
  type RateSettingsRepository,
} from '../domain/index.js';

const DB_NAMES: Readonly<Record<RateName, DbRateName>> = {
  maintenanceFee: DbRateName.MAINTENANCE_FEE,
  cleaningPerVisit: DbRateName.CLEANING_PER_VISIT,
  garbageWeekly: DbRateName.GARBAGE_WEEKLY,
  shiftSkipPenalty: DbRateName.SHIFT_SKIP_PENALTY,
};
const RATE_NAMES = Object.keys(DB_NAMES) as RateName[];

@Injectable()
export class PrismaRateSettingsRepository implements RateSettingsRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async load(): Promise<RateSettings | null> {
    const rows = await this.database.db.rateChange.findMany();
    if (rows.length === 0) return null;
    const historyOf = (name: RateName): RateChange[] =>
      rows
        .filter((row) => row.rate === DB_NAMES[name])
        .map((row) => ({
          effectiveFrom: fromDbDate(row.effectiveFrom),
          amount: fromDbMoney(row.amount),
        }));
    return RateSettings.restore({
      maintenanceFee: historyOf('maintenanceFee'),
      cleaningPerVisit: historyOf('cleaningPerVisit'),
      garbageWeekly: historyOf('garbageWeekly'),
      shiftSkipPenalty: historyOf('shiftSkipPenalty'),
    });
  }

  async save(settings: RateSettings): Promise<void> {
    await this.database.db.rateChange.createMany({
      data: RATE_NAMES.flatMap((name) =>
        settings.historyOf(name).map((change) => ({
          rate: DB_NAMES[name],
          effectiveFrom: toDbDate(change.effectiveFrom),
          amount: change.amount.centavos,
        })),
      ),
      skipDuplicates: true,
    });
  }
}
