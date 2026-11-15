import { test, expect } from '@playwright/test';
test('homepage is public and exposes sign in and account creation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Make room for what matters/i })).toBeVisible();
  await page.getByRole('link', { name: 'Login', exact: true }).click();
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

test('reference hero and feature cards fit mobile and desktop without horizontal overflow', async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/');
    await expect(page.locator('.public-hero')).toBeVisible();
    await expect(page.locator('.budget-scene')).toBeVisible();
    await expect(page.locator('.public-features .feature')).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  }
});
test('homepage account creation and recovery keep distinct form states', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByRole('button', { name: /Already have an account/ }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.locator('#accountPasswordField')).toBeHidden();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.locator('#accountPasswordField')).toBeVisible();
});

test('mobile homepage keeps Login and Sign Up on the right and removes duplicate hero login', async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const header = page.locator('.public-header');
    const login = header.getByRole('link', { name: 'Login' });
    const signup = header.getByRole('link', { name: 'Sign Up' });
    await expect(login).toBeVisible();
    await expect(signup).toBeVisible();
    await expect(page.locator('.public-hero .actions a')).toHaveCount(1);
    await expect(page.locator('.public-hero .actions a')).toHaveText('Get started');
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.public-header').getBoundingClientRect();
      const brand = document.querySelector('.public-header .brand').getBoundingClientRect();
      const nav = document.querySelector('.public-header nav').getBoundingClientRect();
      const links = [...document.querySelectorAll('.public-header nav a')].map(el => el.getBoundingClientRect());
      return { headerRight: header.right, brandRight: brand.right, navLeft: nav.left, navRight: nav.right,
        links: links.map(rect => ({ left: rect.left, right: rect.right, top: rect.top })),
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    expect(geometry.overflow).toBe(false);
    if (width <= 768) {
      expect(geometry.navLeft).toBeGreaterThanOrEqual(geometry.brandRight - 1);
      expect(geometry.navRight).toBeLessThanOrEqual(geometry.headerRight + 1);
      expect(geometry.links[1].left).toBeGreaterThan(geometry.links[0].right - 1);
      expect(geometry.links[1].top).toBe(geometry.links[0].top);
    }
  }
});
