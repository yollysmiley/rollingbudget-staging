import { test, expect } from '@playwright/test';

test('mobile confirmation page keeps branded success content readable without horizontal overflow', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.supabase = { createClient: () => ({ auth: { getSession: async () => ({
      data: { session: { user: { email: 'confirmed@example.com' } } }, error: null
    }) } }) };`
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/auth-confirmation.html#access_token=fake-access-token&type=signup');
  await expect(page.locator('#statusTitle')).toHaveText('Your email is confirmed');
  await expect(page.locator('#continueLink')).toBeVisible();
  await expect(page.locator('.mark span')).toHaveCount(3);
  await expect(page.locator('#continueLink')).toHaveCSS('min-height', '48px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
