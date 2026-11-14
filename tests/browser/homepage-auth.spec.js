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
  await expect(dialog.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  await dialog.locator('#accountModeSwitch').click();
  await expect(dialog.locator('#accountTitle')).toHaveText('Create your account');
  await expect(dialog.locator('#accountPassword')).toHaveAttribute('autocomplete', 'new-password');
  await expect(dialog.locator('.account-brand')).toContainText('Rolling Budget');
  await dialog.locator('#accountModeSwitch').click();
  await expect(dialog.locator('#accountTitle')).toHaveText('Welcome back!');
  await dialog.locator('#accountCancel').click();
  await expect(dialog).toBeHidden();
});

test('homepage forgot password requests email before navigating to recovery page', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:null},error:null}),resetPasswordForEmail:async(email,options)=>{window.__resetRequest={email,redirectTo:options.redirectTo};return {error:null};}}})};`
  }));
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign In', exact: true }).click();
  const dialog = page.locator('#accountDialog');
  await dialog.locator('#accountForgot').click();
  await expect(dialog.locator('#accountTitle')).toHaveText('Reset your password');
  await expect(dialog.locator('#accountPasswordField')).toBeHidden();
  await dialog.locator('#accountEmail').fill('user@example.com');
  await dialog.locator('#accountSubmit').click();
  await expect(dialog.locator('#accountMessage')).toContainText('password reset link will be sent');
  const request = await page.evaluate(() => window.__resetRequest);
  expect(request.email).toBe('user@example.com');
  expect(new URL(request.redirectTo).pathname).toBe('/reset-password.html');
  expect(new URL(request.redirectTo).origin).toBe(new URL(page.url()).origin);
  await expect(page).toHaveURL('/');
  await dialog.locator('#accountBack').click();
  await expect(dialog.locator('#accountPasswordField')).toBeVisible();
});
