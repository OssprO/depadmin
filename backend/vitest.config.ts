import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      // Domain and use cases are held to a coverage floor (docs/adr/0008-pruebas.md);
      // adapters are covered by integration tests instead.
      include: [
        'src/shared-kernel/**/*.ts',
        'src/modules/*/domain/**/*.ts',
        'src/modules/*/application/**/*.ts',
      ],
      exclude: ['**/*.spec.ts', '**/testing.ts', '**/index.ts'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
