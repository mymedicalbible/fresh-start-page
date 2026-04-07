import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { defineConfig } from '@playwright/test'

const configDir = path.dirname(fileURLToPath(import.meta.url))
// Playwright does not load .env automatically; `.env.playwright` wins over `.env.local` / `.env`
dotenv.config({ path: path.join(configDir, '.env') })
dotenv.config({ path: path.join(configDir, '.env.local'), override: true })
dotenv.config({ path: path.join(configDir, '.env.playwright'), override: true })

/**
 * baseURL must include the scheme (https:// or http://). Relative paths like `page.goto('/')`
 * are resolved against this value.
 *
 * Local dev: set in `.env.playwright` or run
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  'https://medical-tracker.mymedicalbible.workers.dev'

export default defineConfig({
  testDir: './playwright-tests',
  testIgnore: ['**/example.spec.ts'],
  use: {
    baseURL,
  },
})