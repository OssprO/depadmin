// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sameModule = { module: '{{from.element.captured.module}}' };

/**
 * Hexagonal dependency rule for the backend (see backend/src/modules/README.md).
 * Default is "allow"; each policy closes one forbidden direction. When several
 * policies match, the last one wins, so narrow "allow" exceptions come last.
 */
const hexagonalPolicies = [
  // The domain knows nothing but itself and the shared kernel: no packages, no Node APIs
  // (time, randomness and IDs come through ports), no other layers.
  {
    from: { element: { types: { anyOf: ['domain', 'shared-kernel'] } } },
    disallow: { to: { module: { origin: ['external', 'core'] } } },
  },
  {
    from: { element: { type: 'shared-kernel' } },
    disallow: {
      to: {
        element: {
          types: {
            anyOf: ['domain', 'application', 'infrastructure', 'http', 'composition', 'platform'],
          },
        },
      },
    },
  },
  {
    from: { element: { type: 'domain' } },
    disallow: {
      to: {
        element: {
          types: {
            anyOf: ['domain', 'application', 'infrastructure', 'http', 'composition', 'platform'],
          },
        },
      },
    },
  },
  {
    from: { element: { type: 'domain' } },
    allow: { to: { element: { type: 'domain', captured: sameModule } } },
  },

  // Application orchestrates its own domain; other modules are reached only through their use cases.
  {
    from: { element: { type: 'application' } },
    disallow: {
      to: { element: { types: { anyOf: ['domain', 'infrastructure', 'http', 'composition'] } } },
    },
  },
  {
    from: { element: { type: 'application' } },
    allow: { to: { element: { type: 'domain', captured: sameModule } } },
  },
  {
    from: { element: { type: 'application' } },
    disallow: { to: { module: { origin: 'external', source: '@prisma/*' } } },
  },

  // Adapters implement ports of their own module and never call each other directly.
  {
    from: { element: { types: { anyOf: ['infrastructure', 'http'] } } },
    disallow: {
      to: { element: { types: { anyOf: ['domain', 'infrastructure', 'http', 'composition'] } } },
    },
  },
  {
    from: { element: { type: 'infrastructure' } },
    allow: {
      to: { element: { types: { anyOf: ['domain', 'infrastructure'] }, captured: sameModule } },
    },
  },
  {
    from: { element: { type: 'http' } },
    allow: { to: { element: { types: { anyOf: ['domain', 'http'] }, captured: sameModule } } },
  },

  // Cross-cutting platform code must not depend on business modules.
  {
    from: { element: { type: 'platform' } },
    disallow: {
      to: {
        element: {
          types: { anyOf: ['domain', 'application', 'infrastructure', 'http', 'composition'] },
        },
      },
    },
  },
];

export default defineConfig([
  globalIgnores(['**/dist', '**/coverage', '**/node_modules']),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Backend (NestJS)
  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: globals.node },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'shared-kernel', pattern: 'backend/src/shared-kernel/**', partialMatch: false },
        {
          type: 'domain',
          pattern: 'backend/src/modules/*/domain/**',
          partialMatch: false,
          capture: ['module'],
        },
        {
          type: 'application',
          pattern: 'backend/src/modules/*/application/**',
          partialMatch: false,
          capture: ['module'],
        },
        {
          type: 'infrastructure',
          pattern: 'backend/src/modules/*/infrastructure/**',
          partialMatch: false,
          capture: ['module'],
        },
        {
          type: 'http',
          pattern: 'backend/src/modules/*/http/**',
          partialMatch: false,
          capture: ['module'],
        },
        {
          type: 'composition',
          pattern: 'backend/src/modules/*/*.module.ts',
          partialMatch: false,
          capture: ['module'],
        },
        { type: 'platform', pattern: 'backend/src/platform/**', partialMatch: false },
      ],
      // Specs may import test tooling (vitest) even when they sit next to domain code.
      'boundaries/ignore': ['backend/**/*.spec.ts'],
      'import/resolver': { typescript: { project: 'backend/tsconfig.json' }, node: true },
    },
    rules: {
      // Value objects print themselves through toString() (e.g. `${month}` → "2026-08").
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allow: [
            { from: 'lib', name: ['Error', 'URL', 'URLSearchParams'] },
            {
              from: 'file',
              name: ['Money', 'YearMonth', 'LocalDate', 'UnitNumber', 'YearMonthRange'],
            },
          ],
        },
      ],
      'boundaries/dependencies': [
        'error',
        { default: 'allow', checkAllOrigins: true, policies: hexagonalPolicies },
      ],
    },
  },

  // Frontend (React)
  {
    files: ['frontend/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // shadcn components export their variants alongside the component.
    files: ['frontend/src/components/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  {
    files: ['packages/shared/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },

  prettier,
]);
