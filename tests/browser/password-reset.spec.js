import { test, expect } from '@playwright/test';

async function mockRecovery(page) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.supabase = { createClient: (url, key, options) => {
      window.__resetConfig = { url, storageKey: options.auth.storageKey, detectSessionInUrl: options.auth.detectSessionInUrl };
      return { auth: {
        onAuthStateChange: callback => { callback('PASSWORD_RECOVERY', { user: { email: 'user@example.com' } }); return { data: { subscription: { unsubscribe() {} } } }; },
        getSession: async () => ({ data: { session: { user: { email: 'user@example.com' } } }, error: null }),
        updateUser: async ({ password }) => { window.__updatedPasswordLength = password.length; return { data: { user: { email: 'user@example.com' } }, error: null }; }
      } };
    } }; `
  }));
}

test.beforeEach(async ({ page }) => mockRecovery(page));

test('desktop reset page validates confirmation and updates the password', async ({ page }) => {
  await page.goto('/reset-password.html?code=fake-recovery-code');
  await expect(page).toHaveTitle(/STAGING - Reset your Rolling Budget password/);
  await expect(page.locator('body')).toContainText('STAGING ONLY');
  await expect(page.locator('#pageTitle')).toHaveText('Create a new password');
  await expect(page.locator('#resetForm')).toBeVisible();
  await page.locator('#newPassword').fill('correct-horse-battery');
  await page.locator('#confirmPassword').fill('different-password');
  await page.locator('#submitButton').click();
  await expect(page.locator('#formMessage')).toHaveText('The passwords do not match. Please try again.');
  expect(await page.evaluate(() => window.__updatedPasswordLength)).toBeUndefined();
  await page.locator('#confirmPassword').fill('correct-horse-battery');
  await page.locator('#submitButton').click();
  await expect(page.locator('#pageTitle')).toHaveText('Your password has been updated');
  await expect(page.locator('#continueLink')).toBeVisible();
  expect(await page.evaluate(() => window.__updatedPasswordLength)).toBe(21);
  const config = await page.evaluate(() => window.__resetConfig);
  expect(config.url).toBe('https://phiscfwfuzeptetimdbo.supabase.co');
  expect(config.storageKey).toBe('rollingbudget_staging_phiscfwfuzeptetimdbo_auth');
  expect(config.detectSessionInUrl).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('expired recovery links show a safe error and never expose provider details', async ({ page }) => {
  await page.goto('/reset-password.html?error=access_denied&error_code=otp_expired');
  await expect(page.locator('#pageTitle')).toHaveText('This reset link is invalid or has expired');
  await expect(page.locator('#resetForm')).toBeHidden();
  await expect(page.locator('#supportMessage')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('otp_expired');
});
