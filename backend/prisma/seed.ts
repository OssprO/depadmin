// Seeds what every environment needs: the ten deptos and the initial rates. It goes through
// the real repositories, so the data passes the same domain rules as the app's.
// Idempotent: running it again changes nothing.
//
// The reporting start (cut-over month and cash on hand) is not seeded: it comes from the
// initial load (docs/PLAN.md, phase 11).
import { PrismaRateSettingsRepository } from '../src/modules/settings/infrastructure/prisma-rate-settings.repository.js';
import { RateSettings } from '../src/modules/settings/domain/index.js';
import { PrismaUnitRepository } from '../src/modules/units/infrastructure/prisma-unit.repository.js';
import { Unit } from '../src/modules/units/domain/index.js';
import { createPrismaClient, PrismaDatabase } from '../src/platform/prisma/prisma-database.js';
import { LocalDate, UnitNumber } from '../src/shared-kernel/index.js';

/** The first shift of the anchor (501, August 2026). */
const RATES_EFFECTIVE_FROM = LocalDate.of(2026, 8, 1);

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const database = new PrismaDatabase(createPrismaClient(databaseUrl));
const units = new PrismaUnitRepository(database);
const rates = new PrismaRateSettingsRepository(database);

try {
  await database.run(async () => {
    for (const number of UnitNumber.all()) {
      if (!(await units.findByNumber(number))) await units.save(Unit.create(number));
    }
    if (!(await rates.load())) await rates.save(RateSettings.startingOn(RATES_EFFECTIVE_FROM));
  });
  console.log('Seed done: 10 deptos and initial rates.');
} finally {
  await database.disconnect();
}
