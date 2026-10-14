import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      // Specs render the whole app and type like a user; with every package's tests running
      // at once (pnpm test), the longer ones need more than the default 5 seconds.
      testTimeout: 15_000,
    },
  }),
);
