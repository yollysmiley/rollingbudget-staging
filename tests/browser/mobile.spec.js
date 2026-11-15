import { mockSignedInBudget, expectAuthenticatedBudget } from './auth-fixture.js';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await mockSignedInBudget(page);
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
  await page.goto('/app/');
  await expectAuthenticatedBudget(page);
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

test('mobile sign-out returns to public homepage without exposing budget', async ({ page }) => {
  const signOut = page.locator('#mobileAuthBtn');
  await expect(signOut).toBeVisible();
  await expect(signOut).toHaveText('Sign Out');
  page.once('dialog', dialog => dialog.accept());
  await signOut.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /Make room for what matters/i })).toBeVisible();
  await expect(page.locator('#incomeBody')).toHaveCount(0);
});

test('mobile sidebar exposes core pages and year management without burying recurring rules in Settings', async ({ page }) => {
  await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('#mobileSidebar')).toBeVisible();
  await expect(page.locator('.mobile-sidebar-nav button')).toHaveText(['Overview', 'Plan', 'Recurring Rules', 'Settings']);
  await expect(page.locator('.mobile-sidebar-nav')).not.toContainText('Activity');
  await expect(page.locator('#mobileSettingsControls')).toBeHidden();
  await expect(page.locator('#activeYearSelect')).toBeHidden();
  await expect(page.getByRole('button', { name: '+ New Year' })).toBeHidden();
  await expect(page.locator('#autoRollToggle')).toBeHidden();
  
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('body')).toHaveClass(/mobile-tab-settings/);
  await expect(page.locator('#mobileSettingsPanel')).toBeVisible();
  await expect(page.locator('#mobileSettingsMenu')).toBeVisible();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Budget Years' }).click();
  await expect(page.locator('#mobileSettingsPanel #mobileActiveYearSelect')).toHaveCount(1);
  await expect(page.locator('#mobileSidebar #mobileActiveYearSelect')).toHaveCount(0);
  await page.locator('#mobileActiveYearSelect').selectOption('2027');
  await expect(page.locator('#mobileActiveYearSelect')).toHaveValue('2027');
  await page.locator('.mobile-settings-back').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Rollover & Automation' }).click();
  await expect(page.locator('#mobileAutoRollToggle')).toBeVisible();
  await expect(page.locator('#authBtn')).toBeHidden();
  await expect(page.locator('#mobileAuthBtn')).toBeVisible();
});

test('mobile menu navigation enters and exits recurring rules without refreshing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  const managerUrl = page.url();
  await expect(page.locator('#recurringManagerPage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Overview' })).toHaveCount(0);

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
  await expect(page.locator('#mobileRecurringPreviewStatus')).toContainText('0 potential recurring entries (preview only, not saved)');
  await expect(page.locator('#mobileApplyRecurringPreview')).toBeDisabled();
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
  await expect(brand.locator('p')).toHaveText('Logged in as browser-test@example.invalid');
  await expect(brand.locator('.brand-bar')).toHaveCount(3);
  await expect(brand.locator('.brand-bar-short')).toHaveCSS('background-color', 'rgb(139, 124, 255)');
  await expect(brand.locator('.brand-bar-tall')).toHaveCSS('background-color', 'rgb(177, 166, 255)');
  await expect(page.locator('#mobileMenuButton')).toBeVisible();
  await expect(page.locator('#mobileAuthBtn')).toBeVisible();
  await expect(page.locator('#mobileAuthBtn')).toHaveText('Sign Out');
  await expect(page.locator('header')).toHaveCSS('background-color', 'rgb(23, 21, 43)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('cancelling mobile sign-out keeps the authenticated budget visible', async ({ page }) => {
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#mobileAuthBtn').click();
  await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
  await expect(page.locator('#mobileAuthBtn')).toHaveText('Sign Out');
  await expect(page.locator('#mobileOverview')).toBeVisible();
});

test('mobile Settings uses independent controls and preserves state after viewport switch', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Budget Years' }).click();
  await expect(page.locator('#mobileActiveYearSelect')).toBeVisible();
  await expect(page.locator('#activeYearSelect')).toBeHidden();
  await page.locator('#mobileActiveYearSelect').selectOption('2027');
  await expect(page.locator('#activeYearSelect')).toHaveValue('2027');
  await page.locator('.mobile-settings-back').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Rollover & Automation' }).click();
  await page.locator('#mobileAutoRollToggle').uncheck();
  await expect(page.locator('#autoRollToggle')).not.toBeChecked();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#activeYearSelect')).toHaveValue('2027');
  await expect(page.locator('#autoRollToggle')).not.toBeChecked();
  await expect(page.locator('#mobileSettingsPanel')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#mobileActiveYearSelect')).toHaveValue('2027');
  await expect(page.locator('#mobileAutoRollToggle')).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('mobile Settings opens one submenu screen and returns to its menu', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('#mobileSettingsMenu')).toBeVisible();
  await expect(page.locator('#mobileSettingsDetail')).toBeHidden();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Budget Accounts' }).click();
  await expect(page.locator('#mobileSettingsMenu')).toBeHidden();
  await expect(page.locator('[data-mobile-settings-section="accounts"]')).toBeVisible();
  await expect(page.locator('[data-mobile-settings-section="years"]')).toBeHidden();
  await page.locator('.mobile-settings-back').click();
  await expect(page.locator('#mobileSettingsMenu')).toBeVisible();
  await expect(page.locator('#mobileSettingsDetail')).toBeHidden();
});

test('mobile Settings returns to its menu when reopened from another page', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Budget Years' }).click();
  await expect(page.locator('#mobileSettingsDetail')).toBeVisible();
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="overview"]').click();
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('#mobileSettingsMenu')).toBeVisible();
  await expect(page.locator('#mobileSettingsDetail')).toBeHidden();
});

test('auto-cascade persists from mobile and desktop through the same budget setting', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Rollover & Automation' }).click();
  await page.locator('#mobileAutoRollToggle').uncheck();
  await expect(page.locator('#autoRollToggle')).not.toBeChecked();
  await page.reload();
  await page.locator('#mobileMenuButton').click();
  // The sidebar animates in from off-screen; a visible element may still be outside the viewport.
  await expect(page.locator('#mobileSidebar')).toHaveAttribute('aria-hidden', 'false');
  await expect.poll(async () => {
    const box = await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').boundingBox();
    return Boolean(box && box.x >= 0 && box.x + box.width <= page.viewportSize().width);
  }).toBe(true);
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Rollover & Automation' }).click();
  await expect(page.locator('#mobileAutoRollToggle')).not.toBeChecked();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#desktopSettingsButton').click();
  await page.locator('[data-settings-section="automation"]').click();
  await page.locator('#autoRollToggle').check();
  await expect(page.locator('#mobileAutoRollToggle')).toBeChecked();
  await page.reload();
  await page.locator('#desktopSettingsButton').click();
  await page.locator('[data-settings-section="automation"]').click();
  await expect(page.locator('#autoRollToggle')).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#mobileAutoRollToggle')).toBeChecked();
});

test('recurring preview status is shared but displayed in distinct mobile and desktop managers', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  await expect(page.locator('#mobileRecurringPreviewStatus')).toContainText('0 potential recurring entries (preview only, not saved)');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#recurringDesktopView')).toBeVisible();
  await expect(page.locator('#desktopRecurringPreviewStatus')).toContainText('0 potential recurring entries (preview only, not saved)');
  await expect(page.locator('#desktopApplyRecurringPreview')).toBeDisabled();
  await expect(page.locator('#recurringMobileView')).toBeHidden();
});

test('mobile apply action saves verified entries once and desktop sees the same budget', async ({ page }) => {
  await page.evaluate(() => {
    const verifiedRule = {
      id: 'verified-demo', name: 'Verified expense', category: 'fixed', amount: 125,
      due: '5th', account_id: null, frequency: 'monthly', start_date: '2026-01-01',
      end_date: null, active: true, source_year: null, versions: [{
        effectiveFrom: '2026-01-01', name: 'Verified expense', amount: 125,
        due: '5th', accountId: null, frequency: 'monthly'
      }]
    };
    sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify([verifiedRule]));
  });
  await page.reload();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  await expect(page.locator('#mobileApplyRecurringPreview')).toBeEnabled();
  await page.locator('#mobileApplyRecurringPreview').click();
  await expect(page.locator('#mobileApplyRecurringPreview')).toBeDisabled();
  const snapshot = await page.evaluate(() => ({
    entries: db[activeYear].months[0].fixed.filter(entry => entry.recurringRuleId === 'verified-demo'),
    year: activeYear
  }));
  expect(snapshot.entries).toHaveLength(1);
  expect(snapshot.entries[0].amount).toBe(125);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#desktopApplyRecurringPreview')).toBeDisabled();
  await page.reload();
  const saved = await page.evaluate(() =>
    db['2026'].months[0].fixed.filter(entry => entry.recurringRuleId === 'verified-demo'));
  expect(saved).toHaveLength(1);
  expect(saved[0].occurrenceId).toBe(JSON.stringify(['verified-demo', '2026-01-01']));
});

test('recurring application warns when cloud persistence fails but retains local entries', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('__mock_budget_cloud_failure', '1');
    sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify([{
      id: 'local-only', name: 'Local-only expense', category: 'fixed', amount: 20,
      due: '1', account_id: null, frequency: 'monthly', start_date: '2026-01-01',
      end_date: null, active: true, source_year: null,
      versions: [{ effectiveFrom: '2026-01-01', name: 'Local-only expense',
        amount: 20, due: '1', accountId: null, frequency: 'monthly' }]
    }]));
  });
  await page.reload();
  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('#mobileSidebar')).toHaveClass(/open/);
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  await expect(page.locator('#mobileApplyRecurringPreview')).toBeEnabled();
  await page.locator('#mobileApplyRecurringPreview').click();
  await expect(page.locator('#cloudSaveStatus')).toContainText('saved on this device only');
  expect(dialogs.some(message => message.includes('Cloud sync failed'))).toBeTruthy();
  const entries = await page.evaluate(() =>
    db[activeYear].months[0].fixed.filter(entry => entry.recurringRuleId === 'local-only'));
  expect(entries).toHaveLength(1);
});
