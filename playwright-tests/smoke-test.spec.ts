import { test, expect } from '@playwright/test';

test.describe('Medical Bible Core Smoke Test', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the base URL before each test
    await page.goto('/');
  });

  test('should load the dashboard and show navigation', async ({ page }) => {
    // Check for a main heading or a specific dashboard element
    await expect(page).toHaveTitle(/Medical Bible/i);
    
    // Verify the main navigation menu or tabs are visible
    // Adjust the selectors below to match your actual "cute card" or nav labels
    await expect(page.getByText(/Log/i)).toBeVisible();
    await expect(page.getByText(/Doctors/i)).toBeVisible();
    await expect(page.getByText(/Meds/i)).toBeVisible();
  });

  test('should navigate to the Log tab and see the form', async ({ page }) => {
    await page.click('text=Log');
    
    // Check if the health diary form appears
    // If you have a specific input, you can target it specifically
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });

  test('should load the Doctors section', async ({ page }) => {
    await page.click('text=Doctors');
    
    // Verify that at least one profile card or the list container renders
    await expect(page.locator('main')).toContainText(/Doctor/i);
  });

  test('should render the Meds and Charts sections without errors', async ({ page }) => {
    // Quick check on Meds
    await page.click('text=Meds');
    await expect(page).not.toHaveTitle(/Error/i);

    // Quick check on Charts
    await page.click('text=Charts');
    const chartContainer = page.locator('canvas, svg'); // Most chart libs use one of these
    await expect(chartContainer.first()).toBeVisible();
  });

});