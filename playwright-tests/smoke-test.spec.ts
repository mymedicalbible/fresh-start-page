import { test, expect } from '@playwright/test'

/** App + HTML title use Medical Bible; older deploys may still show Medical Tracker. */
const APP_BRAND = /Medical (Bible|Tracker)/i

test.describe('Medical Bible Core Smoke Test', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login\/?$/)
    await expect(page).toHaveTitle(APP_BRAND)
    await expect(page.getByRole('heading', { name: APP_BRAND })).toBeVisible()
    await expect(page.getByLabel(/^email$/i)).toBeVisible()
    await expect(page.getByLabel(/^password$/i)).toBeVisible()
  })

  test('should show the sign-in form on /login', async ({ page }) => {
    await page.goto('/login')
    const form = page.locator('form')
    await expect(form).toBeVisible()
    await expect(form.getByRole('button', { name: /^sign in$/i })).toBeVisible()
  })
})

test.describe('Medical Bible — authenticated smoke', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.PLAYWRIGHT_SMOKE_EMAIL?.trim()
    const password = process.env.PLAYWRIGHT_SMOKE_PASSWORD?.trim()
    test.skip(
      !email || !password,
      'Add PLAYWRIGHT_SMOKE_EMAIL and PLAYWRIGHT_SMOKE_PASSWORD to `.env.playwright` (see .env.playwright.example) or export them before running tests.',
    )

    await page.goto('/login')
    await page.getByLabel(/^email$/i).fill(email!)
    await page.getByLabel(/^password$/i).fill(password!)
    await page.locator('form').getByRole('button', { name: /^sign in$/i }).click()
    await expect(page).toHaveURL(/\/app\/?$/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: /your records/i })).toBeVisible({ timeout: 15_000 })
  })

  test('should load the dashboard and show main sections', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /log today/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /your records/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /doctors/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /medications/i })).toBeVisible()
  })

  test('should open quick log (pain flow)', async ({ page }) => {
    await page.goto('/app/log?tab=pain')
    await expect(page.getByText(/^intensity$/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /next/i })).toBeVisible()
  })

  test('should load doctors and meds routes', async ({ page }) => {
    await page.goto('/app/doctors')
    await expect(page.getByRole('heading', { name: /my doctors/i })).toBeVisible()

    await page.goto('/app/meds')
    await expect(page.getByRole('heading', { name: /^medications$/i })).toBeVisible()
  })

  test('should load analytics (charts) without error title', async ({ page }) => {
    await page.goto('/app/analytics')
    await expect(page).not.toHaveTitle(/error/i)
    await expect(page.getByRole('heading', { name: /charts.? &.? trends/i })).toBeVisible()
  })
})
