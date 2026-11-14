import { test, expect } from '@playwright/test';

test('mobile public auth dialogs retain logo, navigation and fit viewport', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Create Account', exact: true }).click();
  const dialog = page.locator('#accountDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.account-brand')).toContainText('Rolling Budget');
  await expect(dialog.locator('#accountTitle')).toHaveText('Create your account');
  await expect(dialog.locator('#accountSubmit')).toBeVisible();
  await expect(dialog.locator('#accountCancel')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  await dialog.locator('#accountModeSwitch').click();
  await expect(dialog.locator('#accountTitle')).toHaveText('Welcome back!');
  await expect(dialog.locator('#accountPassword')).toHaveAttribute('autocomplete', 'current-password');
});
