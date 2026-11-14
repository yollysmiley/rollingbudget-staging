import { test, expect } from '@playwright/test';

async function mockSupabase(page) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.supabase = { createClient: (url, key, options) => {
      window.__supabaseConfirmationConfig = { url, storageKey: options.auth.storageKey };
      return { auth: { getSession: async () => ({
        data: { session: location.hash.includes('access_token=') ? { user: { email: 'confirmed@example.com' } } : null },
        error: null
      }) } };
    } };`
  }));
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
});

test('desktop confirmation page displays success and continues to the staging app', async ({ page }) => {
  await page.goto('/auth-confirmation.html#access_token=fake-access-token&type=signup');
  await expect(page).toHaveTitle(/STAGING - Confirm your Rolling Budget email/);
  await expect(page.locator('body')).toContainText('STAGING ONLY');
  await expect(page.locator('#statusTitle')).toHaveText('Your email is confirmed');
  await expect(page.locator('#continueLink')).toBeVisible();
  await expect(page.locator('#continueLink')).toHaveAttribute('href', './rollover-budget-app.html');
  await expect(page.locator('.mark span')).toHaveCount(3);
  const config = await page.evaluate(() => window.__supabaseConfirmationConfig);
  expect(config.url).toBe('https://phiscfwfuzeptetimdbo.supabase.co');
  expect(config.storageKey).toBe('rollingbudget_staging_phiscfwfuzeptetimdbo_auth');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('expired Supabase confirmation links show a recovery message without exposing provider errors', async ({ page }) => {
  await page.goto('/auth-confirmation.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.locator('#statusTitle')).toHaveText('This link is invalid or has expired');
  await expect(page.locator('#statusMessage')).toContainText('request a new confirmation email');
  await expect(page.locator('#continueLink')).toBeHidden();
  await expect(page.locator('#supportMessage')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('otp_expired');
});

test('invalid confirmation links without a session show the same safe recovery state', async ({ page }) => {
  await page.goto('/auth-confirmation.html');
  await expect(page.locator('#statusTitle')).toHaveText('This link is invalid or has expired');
  await expect(page.locator('#supportMessage')).toBeVisible();
});
