import { test, expect } from '@playwright/test';
import { mockSignedInBudget, expectAuthenticatedBudget } from './auth-fixture.js';

test.beforeEach(async ({ page }) => {
  await mockSignedInBudget(page);
  await page.route('https://**/rest/v1/**', route => route.abort());
  await page.route('https://**/auth/v1/**', route => route.abort());
  await page.goto('/app/');
  await expectAuthenticatedBudget(page);
});

test('desktop SPA navigation preserves routes, highlights, and history', async ({ page }) => {
  const cases = [
    ['overview', '#desktopOverviewButton'],
    ['budget', '#desktopBudgetButton'],
    ['settings', '#desktopSettingsButton'],
    ['recurring-rules', '#desktopRecurringButton']
  ];
  for (const [route, selector] of cases) {
    await page.locator(selector).click();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${route}(?:&|$)`));
    await expect(page.locator(selector)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.desktop-primary-nav [aria-current="page"]')).toHaveCount(1);
    await page.reload();
    await expectAuthenticatedBudget(page);
    await expect(page.locator(selector)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.desktop-primary-nav [aria-current="page"]')).toHaveCount(1);
  }
  await expect(page.locator('body')).toHaveClass(/recurring-manager-open/);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]page=settings(?:&|$)/);
  await expect(page.locator('#desktopSettingsPanel')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/recurring-manager-open/);
  await page.goForward();
  await expect(page.locator('#desktopRecurringButton')).toHaveAttribute('aria-current', 'page');
});

test('direct desktop routes survive refresh without resetting the selected month', async ({ page }) => {
  await page.evaluate(() => selectMonth(4));
  await page.locator('#desktopOverviewButton').click();
  await expect(page.locator('#mobileOverview')).toBeVisible();
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect(page.locator('#desktopOverviewButton')).toHaveAttribute('aria-current', 'page');
  await page.goto('/app/?page=budget');
  await expectAuthenticatedBudget(page);
  await expect(page.locator('#desktopBudgetButton')).toHaveAttribute('aria-current', 'page');
});
