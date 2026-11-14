import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://**/rest/v1/**', route => route.abort());
  await page.route('https://**/auth/v1/**', route => route.abort());
  await page.addInitScript(() => {
    window.__errors = [];
    window.addEventListener('error', event => window.__errors.push(event.message));
    if (!sessionStorage.getItem('__budget_test_storage_cleaned')) {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('rollingbudget_staging_phiscfwfuzeptetimdbo_')) localStorage.removeItem(key);
      }
      sessionStorage.setItem('__budget_test_storage_cleaned', '1');
    }
  });
  await page.goto('/rollover-budget-app.html');
  await expect(page).toHaveTitle(/STAGING/);
  await expect(page.locator('body')).toContainText('STAGING ONLY');
  await expect(page.locator('#mobileOverview')).toBeVisible();
  await expect(page.locator('#rollingStrip .month-pill')).toHaveCount(12);
});

test('mobile overview renders the balance, snapshot and allocation sections', async ({ page }) => {
  await expect(page.locator('#mobileOverview .mobile-overview-hero')).toBeVisible();
  await expect(page.locator('#mobileOverview .mobile-snapshot-grid')).toBeVisible();
  await expect(page.locator('#mobileOverview .mobile-allocation')).toBeVisible();
  await expect(page.locator('.main-grid')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => window.__errors)).toEqual([]);
});

test('mobile navigation switches between Overview and Plan', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('#mobileSidebar')).toHaveClass(/open/);
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="plan"]').click();
  await expect(page.locator('body')).toHaveClass(/mobile-tab-plan/);
  await expect(page.locator('#mobileOverview')).toBeHidden();
  await expect(page.locator('.main-grid')).toBeVisible();
  await expect(page.locator('#rollingStrip')).toBeVisible();

  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="overview"]').click();
  await expect(page.locator('body')).toHaveClass(/mobile-tab-overview/);
  await expect(page.locator('#mobileOverview')).toBeVisible();
  await expect(page.locator('.main-grid')).toBeHidden();
});

test('mobile plan cards can be collapsed and expanded individually', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav [data-mobile-tab="plan"]').click();
  const incomeCard = page.locator('.main-grid .card').filter({ has: page.locator('#incomeBody') });
  const toggle = incomeCard.locator('.mobile-card-toggle');

  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(incomeCard).toHaveClass(/mobile-collapsed/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(incomeCard).not.toHaveClass(/mobile-collapsed/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('mobile plan supports collapsing and expanding all budget cards', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav [data-mobile-tab="plan"]').click();
  const cards = page.locator('.main-grid .card');
  await expect(cards).toHaveCount(5);

  await page.locator('#toggleAllCards').click();
  await expect(cards).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    await expect(cards.nth(index)).toHaveClass(/mobile-collapsed/);
  }
  await expect(page.locator('#toggleAllCards')).toHaveText('Expand all cards');

  await page.locator('#toggleAllCards').click();
  for (let index = 0; index < 5; index++) {
    await expect(cards.nth(index)).not.toHaveClass(/mobile-collapsed/);
  }
  await expect(page.locator('#toggleAllCards')).toHaveText('Collapse all cards');
});

test('mobile header exposes Sign In and branded authentication modes', async ({ page }) => {
  const signIn = page.locator('#mobileAuthBtn');
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveText('Sign In');
  await signIn.click();
  const modal = page.locator('#authModal');
  await expect(modal).toHaveClass(/open/);
  await expect(modal.locator('.auth-brand-mark span')).toHaveCount(3);
  await expect(modal.locator('#authEmail')).toBeVisible();
  await expect(modal.locator('#authPassword')).toBeVisible();
  await modal.locator('#authModeLink').click();
  await expect(modal.locator('#authModalTitle')).toHaveText('Create your account');
  await expect(modal.locator('#authSubmitBtn')).toHaveText('Create Account');
  await modal.locator('#authResetLink').click();
  await expect(modal.locator('#authModalTitle')).toHaveText('Reset your password');
  await expect(modal.locator('#authPasswordGroup')).toBeHidden();
  await expect(modal.locator('.auth-brand-mark span')).toHaveCount(3);
  await modal.locator('#authModal button').filter({ hasText: 'Cancel' }).click();
  await expect(modal).not.toHaveClass(/open/);
});

test('mobile sidebar exposes core pages and year management without burying recurring rules in Settings', async ({ page }) => {
  await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('#mobileSidebar')).toBeVisible();
  await expect(page.locator('.mobile-sidebar-nav button')).toHaveText(['Overview', 'Plan', 'Recurring Rules', 'Settings']);
  await expect(page.locator('.mobile-sidebar-nav')).not.toContainText('Activity');
  await expect(page.locator('#mobileSettingsControls')).toBeVisible();
  await expect(page.locator('#activeYearSelect')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New Year' })).toBeVisible();
  await expect(page.locator('#autoRollToggle')).toBeVisible();
  await page.locator('#activeYearSelect').selectOption('2027');
  await expect(page.locator('#activeYearSelect')).toHaveValue('2027');
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('body')).toHaveClass(/mobile-tab-settings/);
  await expect(page.locator('#mobileSettingsPanel')).toBeVisible();
  await expect(page.locator('#activeYearSelect')).toBeHidden();
  await expect(page.locator('#authBtn')).toBeHidden();
  await expect(page.locator('#mobileAuthBtn')).toBeVisible();
});

test('mobile menu navigation enters and exits recurring rules without refreshing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  const managerUrl = page.url();
  await expect(page.locator('#recurringManagerPage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to budget' })).toHaveCount(0);

  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="plan"]').click();
  await expect(page.locator('#recurringManagerPage')).toBeHidden();
  await expect(page.locator('.main-grid')).toBeVisible();

  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  await expect(page.locator('#recurringManagerPage')).toBeVisible();

  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="overview"]').click();
  await expect(page.locator('#recurringManagerPage')).toBeHidden();
  await expect(page.locator('#mobileOverview')).toBeVisible();
  await expect(page).toHaveURL(managerUrl);
});

test('mobile recurring manager uses its distinct card layout and supports rule creation', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  await expect(page.locator('#recurringManagerPage')).toBeVisible();
  await expect(page.locator('#recurringMobileView')).toBeVisible();
  await expect(page.locator('#recurringDesktopView')).toBeHidden();
  const form=page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Annual Insurance');
  await form.locator('[data-rec-field="amount"]').fill('1200');
  await form.locator('[data-rec-field="frequency"]').selectOption('annually');
  await page.getByRole('button',{name:'Add rule'}).last().click();
  await expect(page.locator('#mobileRulesList')).toContainText('Annual Insurance');
  await expect(page.locator('#mobileRulesList')).toContainText('Annually');
  const size=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));
  expect(size.content).toBeLessThanOrEqual(size.width+1);
});


test('mobile header matches the approved email branding and preserves menu and sign-in controls', async ({ page }) => {
  const brand = page.locator('header .title-group');
  await expect(brand.locator('h1')).toHaveText('Rolling Budget');
  await expect(brand.locator('p')).toHaveText('Plan smarter. Grow stronger.');
  await expect(brand.locator('.brand-bar')).toHaveCount(3);
  await expect(brand.locator('.brand-bar-short')).toHaveCSS('background-color', 'rgb(139, 124, 255)');
  await expect(brand.locator('.brand-bar-tall')).toHaveCSS('background-color', 'rgb(177, 166, 255)');
  await expect(page.locator('#mobileMenuButton')).toBeVisible();
  await expect(page.locator('#mobileAuthBtn')).toBeVisible();
  await expect(page.locator('#mobileAuthBtn')).toHaveText('Sign In');
  await expect(page.locator('header')).toHaveCSS('background-color', 'rgb(23, 21, 43)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
