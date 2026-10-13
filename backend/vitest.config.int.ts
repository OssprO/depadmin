import { defineConfig } from 'vitest/config';

// Integration tests: Prisma adapters against a real PostgreSQL started by Testcontainers.
export default defineConfig({
  test: {
    include: ['src/**/*.int-spec.ts', 'test/**/*.int-spec.ts'],
    globalSetup: ['test/support/postgres.global-setup.ts'],
    // One database for the whole run; files reset it, so they must not run concurrently.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
