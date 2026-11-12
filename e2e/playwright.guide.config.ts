import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './support/accounts.js';

// The user guide's screenshots and PDF (frontend/src/features/help/guide.ts), not a test
// suite: `pnpm guide` after `pnpm build`, by hand, whenever a screen the guide shows
// changes. It starts the same throwaway stack as the browser tests.
export default defineConfig({
  testDir: './guide',
  globalSetup: './global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: BASE_URL,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    // The guide is printed and read on phones in daylight: always the light theme.
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  // A phone, as the owners use it, with sharp but not heavy screenshots.
  projects: [{ name: 'guide', use: { ...devices['Pixel 7'], deviceScaleFactor: 2 } }],
});
