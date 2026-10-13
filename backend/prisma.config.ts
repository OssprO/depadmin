import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env by itself. Missing is fine: `prisma generate` needs no
// database, and CI or production pass DATABASE_URL in the environment.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
