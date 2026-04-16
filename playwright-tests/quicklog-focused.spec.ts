import { test, expect } from '@playwright/test'

test.describe('Quick Log pain/symptom switching', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.PLAYWRIGHT_SMOKE_EMAIL?.trim()
    const password = process.env.PLAYWRIGHT_SMOKE_PASSWORD?.trim()
    test.skip(!email || !password, 'Missing Playwright smoke credentials.')

    await page.goto('/login')
    await page.getByLabel(/^email$/i).fill(email!)
    await page.getByLabel(/^password$/i).fill(password!)
    await page.locator('form').getByRole('button', { name: /^sign in$/i }).click()
    await page.waitForURL(/\/app\/?$/, { timeout: 20_000 })
  })

  test('supports switching between pain and symptoms with internal back navigation', async ({ page }) => {
    await page.goto('/app/log?tab=pain')

    await expect(page.getByRole('button', { name: /^pain$/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^symptoms$/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^both$/i }).first()).toBeVisible()
    await expect(page.getByText(/^intensity$/i)).toBeVisible()

    await page.getByRole('button', { name: /^both$/i }).click()
    await page.getByRole('button', { name: /^symptoms$/i }).first().click()
    await expect(page.getByRole('heading', { name: /log symptoms/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue to pain/i })).toBeVisible()

    await page.getByRole('button', { name: /continue to pain/i }).click()
    await expect(page.getByText(/^intensity$/i)).toBeVisible()

    await page.getByRole('button', { name: /next/i }).click()
    await expect(page.getByText(/^location$/i)).toBeVisible()

    await page.getByRole('button', { name: /back to intensity/i }).click()
    await expect(page.getByText(/^intensity$/i)).toBeVisible()

    await page.getByRole('button', { name: /^symptoms$/i }).last().click()
    await expect(page.getByRole('heading', { name: /log symptoms/i })).toBeVisible()

    await page.getByRole('button', { name: /^back$/i }).click()
    await expect(page.getByText(/^intensity$/i)).toBeVisible()
  })
})
