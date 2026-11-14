import { test, expect } from '@playwright/test';
test('homepage is public and exposes sign in and account creation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Make room for what matters/i })).toBeVisible();
  await page.getByRole('link', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
test('unauthenticated visitors cannot view budget at app route', async ({ page }) => {
  await page.route('https://**/auth/v1/**', route => route.abort());
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#incomeBody')).toHaveCount(0);
});
test('unauthenticated visitors cannot view budget at legacy route', async ({ page }) => {
  await page.route('https://**/auth/v1/**', route => route.abort());
  await page.goto('/rollover-budget-app.html');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#incomeBody')).toHaveCount(0);
});
