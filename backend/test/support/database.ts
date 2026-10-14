import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createPrismaClient, PrismaDatabase } from '../../src/platform/prisma/prisma-database.js';
import { UnitNumber } from '../../src/shared-kernel/index.js';

// Every table but audit_log, which is append-only even for tests.
const RESETTABLE_TABLES = [
  'refresh_token',
  'app_user',
  'cash_movement',
  'charge',
  'shift_delegation',
  'unit_inactive_period',
  'rate_change',
  'monthly_report',
  'reporting_start',
  'unit',
];

/**
 * Connects the spec file to the integration database and empties it before each test,
 * leaving the ten deptos in place.
 */
export function useTestDatabase(): { readonly database: PrismaDatabase } {
  const context = {} as { database: PrismaDatabase };

  beforeAll(() => {
    context.database = new PrismaDatabase(createPrismaClient(inject('databaseUrl')));
  });

  beforeEach(async () => {
    const { client } = context.database;
    await client.$executeRawUnsafe(`TRUNCATE ${RESETTABLE_TABLES.join(', ')} CASCADE`);
    await client.unit.createMany({
      data: UnitNumber.all().map((unit) => ({ number: unit.value })),
    });
  });

  afterAll(async () => {
    await context.database?.disconnect();
  });

  return context;
}
