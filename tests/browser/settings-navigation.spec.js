import { test, expect } from '@playwright/test';
import { mockSignedInBudget, expectAuthenticatedBudget } from './auth-fixture.js';

test('desktop Budget replaces Overview and Plan and Settings displays one section at a time', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockSignedInBudget(page);
  await page.route('https://**/rest/v1/**', route => route.abort());
  await page.route('https://**/auth/v1/**', route => route.abort());
  await page.goto('/app/');
  await expectAuthenticatedBudget(page);
  await expect(page.locator('#desktopBudgetButton')).toHaveText('Budget');
  await expect(page.locator('#desktopPlanButton')).toHaveCount(0);
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#settingsAccounts')).toBeVisible();
  await expect(page.locator('#settingsYears')).toBeHidden();
  await page.locator('[data-settings-section="years"]').click();
  await expect(page.locator('#settingsAccounts')).toBeHidden();
  await expect(page.locator('#settingsYears')).toBeVisible();
  await expect(page.locator('#settingsAutomation')).toBeHidden();
  await page.locator('[data-settings-section="security"]').click();
  await expect(page.locator('#settingsProfile')).toBeVisible();
  await expect(page.locator('#settingsYears')).toBeHidden();
  await page.locator('#desktopBudgetButton').click();
  await expect(page.locator('#desktopSettingsPanel')).toBeHidden();
  await expect(page.locator('.main-grid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
