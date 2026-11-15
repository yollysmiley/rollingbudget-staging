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

test('planning month persists per year across routes and refresh', async ({ page }) => {
  await page.evaluate(() => selectMonth(4));
  await expect(page.locator('#rollingStrip .month-pill.active')).toContainText(/may/i);
  await page.locator('#desktopOverviewButton').click();
  await expect(page.locator('#mobileOverview')).toContainText(/may/i);
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect(page.locator('#mobileOverview')).toContainText(/may/i);
  await page.locator('#desktopBudgetButton').click();
  await expect(page.locator('#rollingStrip .month-pill.active')).toContainText(/may/i);

  await page.evaluate(() => switchYear('2027'));
  await expect(page.locator('#rollingStrip .month-pill.active')).toContainText(/jan/i);
  await page.evaluate(() => selectMonth(8));
  await expect(page.locator('#rollingStrip .month-pill.active')).toContainText(/sep/i);
  await page.evaluate(() => switchYear('2026'));
  await expect(page.locator('#rollingStrip .month-pill.active')).toContainText(/may/i);
  await page.evaluate(() => switchYear('2027'));
  await expect(page.locator('#rollingStrip .month-pill.active')).toContainText(/sep/i);
  await page.reload();
  await expectAuthenticatedBudget(page);
  await page.evaluate(() => switchYear('2027'));
  await expect(page.locator('#rollingStrip .month-pill.active')).toContainText(/sep/i);
});

test('invalid saved month defaults to calendar month and another account cannot reuse it', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('rollingbudget_selected_month:browser-test-owner:2026', '99');
  });
  await page.reload();
  await expectAuthenticatedBudget(page);
  const expected = await page.evaluate(() => defaultMonthIndex('2026'));
  expect(await page.evaluate(() => selectedIdx)).toBe(expected);
  await page.evaluate(() => selectMonth(3));
  await page.evaluate(() => {
    currentUser = { id: 'different-test-owner' };
    selectedIdx = restoreSelectedMonth('2026');
  });
  expect(await page.evaluate(() => selectedIdx)).toBe(expected);
});
