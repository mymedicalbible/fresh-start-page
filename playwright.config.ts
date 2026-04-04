import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './playwright-tests',
  use: {
    baseURL: 'medical-tracker.mymedicalbible.workers.dev',
  },
});