import { test, expect } from '@playwright/test';

test('mobile password reset page remains usable without horizontal overflow', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.supabase = { createClient: () => ({ auth: {
      onAuthStateChange: callback => { callback('PASSWORD_RECOVERY', { user: { email: 'user@example.com' } }); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: { user: { email: 'user@example.com' } } }, error: null }),
      updateUser: async () => ({ data: { user: {} }, error: null })
    } }) }; `
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reset-password.html?code=fake-recovery-code');
  await expect(page.locator('#resetForm')).toBeVisible();
  await expect(page.locator('.mark span')).toHaveCount(3);
  await expect(page.locator('#newPassword')).toBeVisible();
  await expect(page.locator('#submitButton')).toHaveCSS('min-height', '48px');
  await page.locator('[data-toggle="newPassword"]').click();
  await expect(page.locator('#newPassword')).toHaveAttribute('type', 'text');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('mobile delayed recovery callback reveals form without overflow', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.supabase = { createClient: () => ({ auth: {
      onAuthStateChange: callback => { setTimeout(() => callback('PASSWORD_RECOVERY', { user: { id: 'test-user' } }), 100); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: null }, error: null })
    } }) };`
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reset-password.html?code=delayed-recovery');
  await expect(page.locator('#resetForm')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
