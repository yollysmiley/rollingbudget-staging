import { test, expect } from '@playwright/test';

test('public sign-in and account creation restore approved branding', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign In', exact: true }).click();
  const dialog = page.locator('#accountDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.account-brand')).toContainText('Rolling Budget');
  await expect(dialog.locator('.account-brand .mark i')).toHaveCount(3);
  await expect(dialog.locator('.account-brand .mark i').first()).toHaveCSS('background-color', 'rgb(139, 124, 255)');
  await expect(dialog.locator('#accountTitle')).toHaveText('Welcome back!');
  await expect(dialog.locator('#accountSubmit')).toHaveCSS('background-color', 'rgb(124, 58, 237)');
  await expect(dialog.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', 'reset-password.html');
  await dialog.locator('#accountModeSwitch').click();
  await expect(dialog.locator('#accountTitle')).toHaveText('Create your account');
  await expect(dialog.locator('#accountPassword')).toHaveAttribute('autocomplete', 'new-password');
  await expect(dialog.locator('.account-brand')).toContainText('Rolling Budget');
  await dialog.locator('#accountModeSwitch').click();
  await expect(dialog.locator('#accountTitle')).toHaveText('Welcome back!');
  await dialog.locator('#accountCancel').click();
  await expect(dialog).toBeHidden();
});
