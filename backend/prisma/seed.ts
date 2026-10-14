// Seeds what every environment needs: the ten deptos, their owner accounts, the superadmin
// and the initial rates. It goes through the real repositories, so the data passes the same
// domain rules as the app's. Idempotent: running it again changes nothing.
//
// Owners start without a password: the superadmin gives each one a temporary password from
// the app. The superadmin is created from SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD, only
// if there is none yet.
//
// The reporting start (cut-over month and cash on hand) is not seeded: it comes from the
// initial load (docs/PLAN.md, phase 11).
import { randomUUID } from 'node:crypto';
import { PASSWORD_MIN_LENGTH } from '@depadmin/shared';
import { User } from '../src/modules/identity/domain/index.js';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher.js';
import { PrismaUserRepository } from '../src/modules/identity/infrastructure/prisma-user.repository.js';
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
const users = new PrismaUserRepository(database);
const rates = new PrismaRateSettingsRepository(database);

/** Hashed before the transaction: argon2 is deliberately slow. */
async function superadminToCreate(): Promise<User | null> {
  const existing = await users.findAll();
  if (existing.some((user) => user.role === 'SUPERADMIN')) return null;

  const username = process.env['SUPERADMIN_USERNAME'];
  const password = process.env['SUPERADMIN_PASSWORD'] ?? '';
  if (!username || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `There is no superadmin yet: set SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD ` +
        `(at least ${PASSWORD_MIN_LENGTH} characters) and run the seed again.`,
    );
  }
  const hash = await new Argon2PasswordHasher().hash(password);
  return User.createSuperadmin(randomUUID(), username, hash);
}

try {
  const superadmin = await superadminToCreate();
  await database.run(async () => {
    for (const number of UnitNumber.all()) {
      if (!(await units.findByNumber(number))) await units.save(Unit.create(number));
      if (!(await users.findByUsername(String(number.value)))) {
        await users.save(User.createOwner(randomUUID(), number));
      }
    }
    if (superadmin) await users.save(superadmin);
    if (!(await rates.load())) await rates.save(RateSettings.startingOn(RATES_EFFECTIVE_FROM));
  });
  console.log(
    `Seed done: 10 deptos with their owner accounts, initial rates` +
      (superadmin ? ` and the superadmin "${superadmin.username}".` : '.'),
  );
} finally {
  await database.disconnect();
}
