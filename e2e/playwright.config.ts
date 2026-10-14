import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './support/accounts.js';

// Browser tests against the built app. Run `pnpm build` first; the global setup starts a
// database, the API and the web server, and stops them at the end.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // One database shared by every test, which change it (passwords, sessions): run in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
  },
  // The app is used on phones: test it in a phone's viewport and with touch.
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
});
