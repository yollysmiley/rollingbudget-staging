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

test('mobile sidebar keeps core routes and year selection is outside Settings', async ({ page }) => {
  await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
  await expect(page.locator('#mobileActiveYearSelect')).toBeVisible();
  await expect(page.locator('#activeYearSelect')).toBeHidden();
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('#mobileSidebar')).toBeVisible();
  await expect(page.locator('.mobile-sidebar-nav button')).toHaveText(['Overview', 'Plan', 'Recurring Rules', 'Settings']);
  await expect(page.locator('.mobile-sidebar-nav')).not.toContainText('Activity');
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('body')).toHaveClass(/mobile-tab-settings/);
  await expect(page.locator('#mobileSettingsPanel')).toBeVisible();
  await expect(page.locator('#mobileSettingsMenu')).toBeVisible();
  await expect(page.locator('#mobileSettingsMenu')).not.toContainText('Budget Years');
  await expect(page.locator('#mobileActiveYearSelect')).toBeHidden();
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
  await expect(page).toHaveURL(/[?&]page=overview(?:&|$)/);
  await page.goBack();
  await expect(page).toHaveURL(managerUrl);
  await expect(page.locator('#recurringManagerPage')).toBeVisible();
});

test('mobile recurring manager has distinct date-based rule creation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  await expect(page.locator('#recurringMobileView')).toBeVisible();
  await expect(page.locator('#recurringDesktopView')).toBeHidden();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Annual Insurance');
  await form.locator('[data-rec-field="amount"]').fill('1200');
  await form.locator('[data-rec-field="startDate"]').fill('2026-03-15');
  await form.locator('[data-rec-field="endDate"]').fill('2027-03-15');
  await form.locator('[data-rec-field="frequency"]').selectOption('annually');
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect(page.locator('#mobileRulesList')).toContainText('Annual Insurance');
  await expect(page.locator('#mobileRulesList')).toContainText('2026-03-15');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
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

test('mobile year selector stays independent from Settings and desktop viewport state', async ({ page }) => {
  const nextYear = String(new Date().getFullYear() + 1);
  await expect(page.locator('#mobileActiveYearSelect')).toBeVisible();
  await page.locator('#mobileActiveYearSelect').selectOption(nextYear);
  await expect(page.locator('#activeYearSelect')).toHaveValue(nextYear);
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('#mobileSettingsMenu')).not.toContainText('Budget Years');
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Rollover & Automation' }).click();
  await page.locator('#mobileAutoRollToggle').uncheck();
  await expect(page.locator('#autoRollToggle')).not.toBeChecked();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#activeYearSelect')).toHaveValue(nextYear);
  await expect(page.locator('#autoRollToggle')).not.toBeChecked();
  await page.locator('#desktopBudgetButton').click();
  await expect(page.locator('#activeYearSelect')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#mobileActiveYearSelect')).toHaveValue(nextYear);
  await expect(page.locator('#mobileActiveYearSelect')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('mobile Settings opens only approved sections and returns to its menu', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('#mobileSettingsMenu')).toBeVisible();
  await expect(page.locator('#mobileSettingsDetail')).toBeHidden();
  await expect(page.locator('[data-mobile-settings-section="years"]')).toHaveCount(0);
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Budget Accounts' }).click();
  await expect(page.locator('#mobileSettingsMenu')).toBeHidden();
  await expect(page.locator('[data-mobile-settings-section="accounts"]')).toBeVisible();
  await page.locator('.mobile-settings-back').click();
  await expect(page.locator('#mobileSettingsMenu')).toBeVisible();
  await expect(page.locator('#mobileSettingsDetail')).toBeHidden();
});

test('mobile Settings returns to its menu when reopened after visiting another page', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Rollover & Automation' }).click();
  await expect(page.locator('#mobileSettingsDetail')).toBeVisible();
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="overview"]').click();
  await expect(page.locator('#mobileActiveYearSelect')).toBeVisible();
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
  // Initial render calls setMobileTab('overview'), which closes the sidebar.
  // Wait for initialization so it cannot race with opening the menu after reload.
  await expect.poll(() => page.evaluate(() => document.body.dataset.mobileTabInitialized)).toBe('true');
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('#mobileSidebar')).toHaveClass(/open/);
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

test('recurring date forms are distinct on mobile and desktop without manual preview controls', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  await expect(page.locator('[data-recurring-form="mobile"] [data-rec-field="startDate"]')).toBeVisible();
  await expect(page.locator('#mobileApplyRecurringPreview, #mobileRecurringPreviewStatus')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('[data-recurring-form="desktop"] [data-rec-field="startDate"]')).toBeVisible();
  await expect(page.locator('#desktopApplyRecurringPreview, #desktopRecurringPreviewStatus')).toHaveCount(0);
});
test('mobile automatic recurring backfill persists across desktop layout and reload', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Verified expense');
  await form.locator('[data-rec-field="amount"]').fill('125');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-05');
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[0].fixed.filter(x => x.name === 'Verified expense').length)).toBe(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  expect(await page.evaluate(() => db['2026'].months[0].fixed.filter(x => x.name === 'Verified expense').length)).toBe(1);
});
test('mobile recurring cloud failure does not add unsaved occurrences', async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem('__mock_budget_cloud_failure', '1'));
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Cloud failure expense');
  await form.locator('[data-rec-field="amount"]').fill('20');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-01');
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect(page.locator('#mobileRulesList')).toContainText('Cloud failure expense');
  expect(await page.evaluate(() => db['2026'].months.flatMap(m => m.fixed).filter(x => x.name === 'Cloud failure expense').length)).toBe(0);
});
test('mobile automatic backfill preserves existing manual transactions', async ({ page }) => {
  await page.evaluate(async () => {
    db['2026'].months[0].fixed.push({ name: 'Rent', amount: 500, accountId: null });
    await saveDB();
  });
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Rent');
  await form.locator('[data-rec-field="amount"]').fill('500');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-01');
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect(page.locator('#mobileRulesList')).toContainText('Rent');
  const entries = await page.evaluate(() => db['2026'].months[0].fixed.filter(x => x.name === 'Rent'));
  expect(entries).toHaveLength(1);
  expect(entries[0].amount).toBe(500);
});
test('mobile preserves an unresolved cloud conflict across reload and offers explicit recovery', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const year = activeYear, key = currentUser.id + ':' + year;
    const cloud = structuredClone(db[year]);
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify({
      [year]: { year: Number(year), budget_data: cloud, updated_at: '2026-11-15T12:00:00.000Z' }
    }));
    cloudBudgetVersions.set(key, '2026-11-15T11:00:00.000Z');
    db[year].months[0].fixed.push({ name: 'Local unsynced entry', amount: 35 });
    const status = await saveDB();
    return { status, marker: localStorage.getItem(conflictStorageKey(year)) };
  });
  expect(result).toEqual({ status: 'local-saved', marker: '1' });
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect(page.locator('#cloudSaveStatus')).toContainText('Unsynced local');
  await expect(page.locator('#cloudSaveStatus button')).toHaveCount(2);
  expect(await page.evaluate(() => db[activeYear].months[0].fixed.some(
    entry => entry.name === 'Local unsynced entry'))).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#cloudSaveStatus button').filter({ hasText: 'Use cloud version' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem(conflictStorageKey(activeYear)))).toBe(null);
  expect(await page.evaluate(() => db[activeYear].months[0].fixed.some(
    entry => entry.name === 'Local unsynced entry'))).toBe(false);
  expect(await page.evaluate(() => Boolean(localStorage.getItem(storageKey(activeYear) + '_conflict_backup')))).toBe(true);
});

test('browser cloud fixture rejects another owner\'s conditional budget update', async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const year = Number(activeYear);
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify({
      [year]: { year, budget_data: structuredClone(db[activeYear]), updated_at: '2026-11-15T00:00:00.000Z' }
    }));
    const { data } = await supabaseClient.from('budget_ui_years')
      .update({ updated_at: '2026-11-15T01:00:00.000Z' })
      .eq('user_id', 'another-owner').eq('year', year)
      .eq('updated_at', '2026-11-15T00:00:00.000Z').select('year');
    return { written: data.length, after: JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))[year].updated_at };
  });
  expect(outcome).toEqual({ written: 0, after: '2026-11-15T00:00:00.000Z' });
});


test('mobile automation settings omit duplicate recurring action while sidebar keeps access', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Rollover & Automation' }).click();
  await expect(page.locator('[data-mobile-settings-section="automation"] button[onclick="openRecurringModal()"]')).toHaveCount(0);
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]')).toBeVisible();
});


test('mobile overview defaults to calendar month and keeps manual month selection', async ({ page }) => {
  const initial = await page.evaluate(() => ({ year: activeYear, month: selectedIdx, nowYear: new Date().getFullYear(), nowMonth: new Date().getMonth() }));
  expect(initial.month).toBe(initial.year === String(initial.nowYear) ? initial.nowMonth : 0);
  await page.evaluate(() => selectMonth(7));
  await page.evaluate(() => render());
  expect(await page.evaluate(() => selectedIdx)).toBe(7);
});

test('mobile SPA routes persist through refresh and browser history', async ({ page }) => {
  const cases = [
    ['overview', 'overview'],
    ['plan', 'budget'],
    ['settings', 'settings']
  ];
  for (const [tab, route] of cases) {
    await page.locator('#mobileMenuButton').click();
    const sidebar = page.locator('#mobileSidebar');
    await expect(sidebar).toHaveClass(/open/);
    // Wait for the slide-in transform to finish before interacting with the link.
    // A CSS-visible element can still be outside the viewport during animation.
    await expect.poll(async () => {
      const rect = await sidebar.boundingBox();
      const viewport = page.viewportSize();
      return Boolean(rect && viewport && rect.x >= -1 && rect.x + rect.width <= viewport.width + 1);
    }).toBe(true);
    await page.locator(`.mobile-sidebar-nav [data-mobile-tab="${tab}"]`).click();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${route}(?:&|$)`));
    await expect(page.locator(`.mobile-sidebar-nav [data-mobile-tab="${tab}"]`)).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expectAuthenticatedBudget(page);
    await expect(page.locator(`.mobile-sidebar-nav [data-mobile-tab="${tab}"]`)).toHaveAttribute('aria-current', 'page');
  }
  await page.locator('#mobileMenuButton').click();
  await page.locator('[data-mobile-action="recurring"]').click();
  await expect(page).toHaveURL(/[?&]page=recurring-rules(?:&|$)/);
  await expect(page.locator('[data-mobile-action="recurring"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('body')).toHaveClass(/recurring-manager-open/);
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect(page.locator('body')).toHaveClass(/recurring-manager-open/);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]page=settings(?:&|$)/);
  await expect(page.locator('body')).not.toHaveClass(/recurring-manager-open/);
  await expect(page.locator('[data-mobile-tab="settings"]')).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(page.locator('[data-mobile-action="recurring"]')).toHaveAttribute('aria-current', 'page');
});

test('mobile planning month persists during session and is independent by year', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('[data-mobile-tab="plan"]').click();
  await page.evaluate(() => selectMonth(6));
  await expect(page.locator('#rollingStrip .month-pill.active')).toContainText(/jul/i);
  await page.locator('#mobileMenuButton').click();
  await page.locator('[data-mobile-tab="overview"]').click();
  await expect(page.locator('#mobileOverview')).toContainText('Jul');
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect(page.locator('#mobileOverview')).toContainText('Jul');
  await page.evaluate(() => switchYear('2027'));
  await expect(page.locator('#mobileOverview')).toContainText(/jan/i);
  await page.evaluate(() => selectMonth(2));
  await expect(page.locator('#mobileOverview')).toContainText(/mar/i);
  await page.evaluate(() => switchYear('2026'));
  await expect(page.locator('#mobileOverview')).toContainText('Jul');
  await page.evaluate(() => switchYear('2027'));
  await expect(page.locator('#mobileOverview')).toContainText('Mar');
});

test('mobile recurring synchronization blocks an unsaved local cache instead of overwriting it', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Protected mobile rule');
  await form.locator('[data-rec-field="amount"]').fill('80');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-01');
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[0].fixed.filter(
    entry => entry.name === 'Protected mobile rule').length)).toBe(1);
  const initial = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem(storageKey('2026')));
    stored.data.months[2].fixed.push({ name: 'Unsaved cached transaction', amount: 55 });
    localStorage.setItem(storageKey('2026'), JSON.stringify(stored));
    return JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))['2026'];
  });
  page.once('dialog', dialog => dialog.accept());
  await page.evaluate(() => backfillSavedRecurringYears(currentUser.id, '2026-01-01'));
  const after = await page.evaluate(() => ({
    row: JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))['2026'],
    conflict: localStorage.getItem(conflictStorageKey('2026')),
    cached: JSON.parse(localStorage.getItem(storageKey('2026'))).data.months[2].fixed
  }));
  expect(after.row).toEqual(initial);
  expect(after.conflict).toBe('1');
  expect(after.cached).toContainEqual({ name: 'Unsaved cached transaction', amount: 55 });
});

test('mobile disable preserves saved entries; re-enable backfills missing future month once', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav [data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Mobile reactivation');
  await form.locator('[data-rec-field="amount"]').fill('60');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-15');
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[11].fixed.filter(
    entry => entry.name === 'Mobile reactivation').length)).toBe(1);
  await page.evaluate(() => {
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'));
    rows['2026'].budget_data.months[11].fixed =
      rows['2026'].budget_data.months[11].fixed.filter(x => x.name !== 'Mobile reactivation');
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
    db['2026'] = structuredClone(rows['2026'].budget_data);
    localStorage.setItem(storageKey('2026'), JSON.stringify({
      data: db['2026'], updatedAt: rows['2026'].updated_at
    }));
  });
  await page.locator('#mobileRulesList').getByRole('button', { name: 'Disable from 2026-12-01' }).click();
  await expect(page.locator('#mobileRulesList')).toContainText('Scheduled from 2026-12-01: Disabled');
  expect(await page.evaluate(() => db['2026'].months[11].fixed.filter(
    x => x.name === 'Mobile reactivation').length)).toBe(0);
  expect(await page.evaluate(() => db['2026'].months[10].fixed.filter(
    x => x.name === 'Mobile reactivation').length)).toBe(1);
  await page.locator('#mobileRulesList').getByRole('button', { name: 'Enable from 2026-12-01' }).click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[11].fixed.filter(
    x => x.name === 'Mobile reactivation').length)).toBe(1);
  const counts = await page.evaluate(() => db['2026'].months.map(month =>
    month.fixed.filter(x => x.name === 'Mobile reactivation').length));
  expect(counts).toEqual(Array(12).fill(1));
  await page.reload();
  expect(await page.evaluate(() => db['2026'].months[11].fixed.filter(
    x => x.name === 'Mobile reactivation').length)).toBe(1);
});

test('mobile recurring synchronization identifies possible duplicates without changing manual entries', async ({ page }) => {
  await page.evaluate(async () => {
    db['2026'].months[0].fixed.push({ name: 'Mobile rental', amount: 70, accountId: null });
    await saveDB();
  });
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav [data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Mobile rental');
  await form.locator('[data-rec-field="amount"]').fill('70');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-15');
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect(page.locator('#mobileRecurringSyncStatus')).toContainText('possible duplicate');
  await expect(page.locator('#mobileRecurringSyncDetails')).toContainText('Skipped Mobile rental on 2026-01-15');
  await expect(page.locator('#mobileRetryRecurringSync')).toBeHidden();
  const january = await page.evaluate(() => db['2026'].months[0].fixed.filter(x => x.name === 'Mobile rental'));
  expect(january).toHaveLength(1);
  expect(january[0]).toEqual({ name: 'Mobile rental', amount: 70, accountId: null });
});

test('mobile recurring retry is scoped to the signed-in account and stays blocked on conflict', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav [data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Mobile retry');
  await form.locator('[data-rec-field="amount"]').fill('27');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-01');
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[0].fixed
    .some(x => x.name === 'Mobile retry'))).toBe(true);
  await page.evaluate(() => {
    const year = '2026', key = currentUser.id + ':' + year;
    db[year].months[1].fixed.push({ name: 'Local-only', amount: 14 });
    markCloudConflict(key, year);
  });
  await page.evaluate(() => backfillSavedRecurringYears(currentUser.id, '2026-01-01'));
  await expect(page.locator('#mobileRetryRecurringSync')).toBeVisible();
  await page.locator('#mobileRetryRecurringSync').click();
  await expect(page.locator('#mobileRecurringSyncStatus')).toContainText('synchronization incomplete');
  const values = await page.evaluate(() => {
    const owner = currentUser.id;
    const own = recurringSyncScopes.length;
    currentUser = { ...currentUser, id: 'other-test-owner' };
    renderRecurringSyncStatus();
    const other = recurringSyncScopes.length;
    const hidden = document.getElementById('mobileRecurringSyncStatus').hidden;
    currentUser = { ...currentUser, id: owner };
    renderRecurringSyncStatus();
    return { own, other, hidden };
  });
  expect(values).toEqual({ own: 1, other: 0, hidden: true });
  expect(await page.evaluate(() => db['2026'].months[1].fixed
    .some(x => x.name === 'Local-only'))).toBe(true);
});

test('mobile recurring status remains successful after a jsonb-reordered cloud response', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav [data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await form.locator('[data-rec-field="name"]').fill('Jsonb-safe mobile');
  await form.locator('[data-rec-field="amount"]').fill('36');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-15');
  await page.getByRole('button', { name: 'Add rule' }).last().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[0].fixed.filter(
    item => item.name === 'Jsonb-safe mobile').length)).toBe(1);
  await page.evaluate(() => {
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'));
    const cloud = rows['2026'];
    const local = structuredClone(cloud.budget_data);
    local.months[5].fixed = local.months[5].fixed.filter(item => item.name !== 'Jsonb-safe mobile');
    db['2026'] = local;
    localStorage.setItem(storageKey('2026'), JSON.stringify({
      data: local, updatedAt: cloud.updated_at
    }));
    const jsonb = value => Array.isArray(value)
      ? value.map(jsonb)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, jsonb(value[key])]))
        : value;
    cloud.budget_data = jsonb(local);
    cloud.updated_at = cloud.updated_at.replace(/Z$/, '+00:00');
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
  });
  await page.evaluate(() => backfillSavedRecurringYears(currentUser.id, '2026-01-15'));
  await expect.poll(() => page.evaluate(() => db['2026'].months[5].fixed.filter(
    item => item.name === 'Jsonb-safe mobile').length)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem(conflictStorageKey('2026')))).toBe(null);
  await expect(page.locator('#mobileRetryRecurringSync')).toBeHidden();
  await expect(page.locator('#mobileRecurringSyncStatus')).toContainText('1 entries added');
});

test('mobile recurring form only shows start and optional end dates', async ({ page }) => {
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav [data-mobile-action="recurring"]').click();
  const form = page.locator('[data-recurring-form="mobile"]');
  await expect(form.getByLabel('Start date')).toBeVisible();
  await expect(form.getByLabel('End date (optional)')).toBeVisible();
  await expect(form.getByLabel(/Due day|Start month/i)).toHaveCount(0);
  await expect(form.locator('[data-rec-field="due"], [data-rec-field="startMonth"]')).toHaveCount(0);
});

test('mobile copy action confirms and shares saved plan across viewport changes', async ({ page }) => {
  const year=String(new Date().getFullYear()),next=String(Number(year)+1);
  await page.evaluate(y => db[y].months[0].variable.push({name:'Groceries plan',amount:250,due:'5th'}),year);
  await page.locator('#mobileActiveYearSelect').selectOption(next);
  await expect(page.locator('#mobileCopyPreviousYear')).toBeVisible();
  await expect(page.locator('#desktopCopyPreviousYear')).toBeHidden();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#mobileCopyPreviousYear').click();
  await expect.poll(() => page.evaluate(y => db[y].months[0].variable[0]?.name,next)).toBe('Groceries plan');
  await expect(page.locator('#mobileCopyPreviousYear')).toBeHidden();
  await page.setViewportSize({width:1280,height:900});
  await expect(page.locator('#activeYearSelect')).toHaveValue(next);
  expect(await page.evaluate(y => db[y].months[0].variable[0].amount,next)).toBe(250);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
});
