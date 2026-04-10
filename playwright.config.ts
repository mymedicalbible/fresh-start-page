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
 * Default is local Vite so sign-in uses the same Supabase project as `.env` (VITE_*).
 * Override only when intentionally testing a deployed URL:
 *   PLAYWRIGHT_BASE_URL=https://… npx playwright test
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || 'http://127.0.0.1:5173'

function isLocalBaseUrl (u: string): boolean {
  try {
    const { hostname } = new URL(u)
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  } catch {
    return false
  }
}

export default defineConfig({
  testDir: './playwright-tests',
  testIgnore: ['**/example.spec.ts'],
  ...(isLocalBaseUrl(baseURL)
    ? {
        webServer: {
          command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  use: {
    baseURL,
  },
})