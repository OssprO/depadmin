import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { PrismaDatabase } from '../../src/platform/prisma/prisma-database.js';
import { CLOCK, type Clock } from '../../src/shared-kernel/index.js';

export const TEST_JWT_SECRET = 'integration-secret-that-is-at-least-32-characters';

/** Rate-limit counters that start empty for every test. */
class ResettableThrottlerStorage implements ThrottlerStorage {
  private inner = new ThrottlerStorageService();

  increment(...args: Parameters<ThrottlerStorage['increment']>) {
    return this.inner.increment(...args);
  }

  reset(): void {
    this.inner.onApplicationShutdown();
    this.inner = new ThrottlerStorageService();
  }
}

/**
 * The whole API, configured as in production, on the integration database. Pair it with
 * `useTestDatabase()`, which empties the tables before each test. Pass a clock (e.g. a
 * `FixedClock`) to pin "today" for rules that depend on the date.
 */
export function useTestApp(options: { clock?: Clock } = {}): {
  readonly app: NestExpressApplication;
  database: PrismaDatabase;
} {
  const context = {} as { app: NestExpressApplication; database: PrismaDatabase };
  const throttler = new ResettableThrottlerStorage();

  beforeAll(async () => {
    process.env['DATABASE_URL'] = inject('databaseUrl');
    process.env['JWT_SECRET'] = TEST_JWT_SECRET;
    process.env['LOG_LEVEL'] = 'silent';
    process.env['JOBS_ENABLED'] = 'false';
    // Imported only now: the config module validates the environment when it loads.
    const { AppModule } = await import('../../src/app.module.js');
    const { configureApp } = await import('../../src/platform/http/configure-app.js');
    const builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(throttler);
    if (options.clock) builder.overrideProvider(CLOCK).useValue(options.clock);
    const moduleRef = await builder.compile();
    context.app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>({ logger: false }),
    );
    await context.app.init();
    context.database = context.app.get(PrismaDatabase);
  });

  beforeEach(() => {
    throttler.reset();
  });

  afterAll(async () => {
    await context.app?.close();
  });

  return context;
}
