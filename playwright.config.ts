import { defineConfig } from '@playwright/test';

/**
 * baseURL must include the scheme (https:// or http://). Relative paths like `page.goto('/')`
 * are resolved against this value.
 *
 * Override for local runs: PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  'https://medical-tracker.mymedicalbible.workers.dev';

export default defineConfig({
  testDir: './playwright-tests',
  testIgnore: ['**/example.spec.ts'],
  use: {
    baseURL,
  },
});