import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    // No database is reached: the Prisma client connects lazily on the first query.
    env: {
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://e2e:e2e@127.0.0.1:1/e2e',
      JWT_SECRET: 'e2e-secret-that-is-at-least-32-characters-long',
    },
  },
});
