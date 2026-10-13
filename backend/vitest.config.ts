import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      // The pure domain is held to a coverage floor (docs/PLAN.md section 5); adapters are
      // covered by integration tests instead.
      include: ['src/shared-kernel/**/*.ts', 'src/modules/*/domain/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/testing.ts', '**/index.ts'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
