import { mockSignedInBudget, expectAuthenticatedBudget } from './auth-fixture.js';
import { switchWhileAccountCatalogLoads } from './account-switch-fixture.js';
import { holdCloudReconciliation, finishHeldReconciliation } from './reconciliation-fixture.js';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Queue real branded-dialog responses before triggering the action.
async function queueBrandedResponses(page, responses) {
  await page.evaluate(items => {
    const backdrop = document.getElementById('rbDialogBackdrop');
    const queue = items.slice();
    window.__brandedDialogSeen = [];
    const observer = new MutationObserver(() => {
      if (backdrop.hidden || !queue.length) return;
      const item = queue.shift();
      window.__brandedDialogSeen.push(document.getElementById('rbDialogMessage').textContent);
      const input = document.getElementById('rbDialogInput');
      if (!input.hidden && item.value !== undefined) {
        input.value = item.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.getElementById(item.decision === 'cancel' ? 'rbDialogCancel' : 'rbDialogAccept').click();
      if (!queue.length) observer.disconnect();
    });
    observer.observe(backdrop, { attributes: true, attributeFilter: ['hidden'] });
  }, responses);
}
async function queueBrandedResponse(page, decision = 'accept', value = '') {
  return queueBrandedResponses(page, [{ decision, value }]);
}

test.beforeEach(async ({ page }) => {
  await mockSignedInBudget(page);
  await page.route('https://**/rest/v1/**', route => route.abort());
  await page.route('https://**/auth/v1/**', route => route.abort());
  await page.addInitScript(() => {
    window.__errors = [];
    window.addEventListener('error', event => window.__errors.push(event.message));
    // addInitScript runs on every navigation; clear once per test context, not on reload.
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
  // An empty tbody has no visible box. Assert the containing desktop card instead.
  await expect(page.locator('.main-grid .card').first()).toBeVisible();
  await expect(page.locator('#incTotalBadge')).toBeVisible();
  // Wait for initApp() to finish its async storage load and first render before interacting.
  await expect(page.locator('#rollingStrip .month-pill')).toHaveCount(12);
});

test('new budget UI starts empty and renders the redesigned dashboard', async ({ page }) => {
  await expect(page.locator('#incTotalBadge')).toHaveText('$0.00');
  await expect(page.locator('#fixTotalBadge')).toHaveText('$0.00');
  await expect(page.locator('#varTotalBadge')).toHaveText('$0.00');
  await expect(page.locator('#loanTotalBadge')).toHaveText('$0.00');
  await expect(page.locator('#ccTotalBadge')).toHaveText('$0.00');
  await expect(page.locator('#rollingStrip .month-pill')).toHaveCount(12);
  expect(await page.evaluate(() => window.__errors)).toEqual([]);
});

test('income and expenses recalculate the rollover', async ({ page }) => {
  await page.locator('#newIncName').fill('Paycheck');
  await page.locator('#newIncAccount').selectOption('');
  await page.locator('#newIncAmount').fill('3000');
  await page.locator('button[onclick="addIncome()"]').click();
  await expect(page.locator('#incTotalBadge')).toHaveText('$3,000.00');

  await page.locator('#newFixName').fill('Rent');
  await page.locator('#newFixDue').selectOption('1');
  await page.locator('#newFixAmt').fill('1200');
  await page.locator('button[onclick="addExpense(\'fixed\')"]').click();
  await expect(page.locator('#fixTotalBadge')).toHaveText('$1,200.00');
  await expect(page.locator('#kpiGrid')).toContainText('$1,800.00');
});

test('new UI saves and restores the guest budget after reload', async ({ page }) => {
  await page.locator('#newIncName').fill('SAVE-RELOAD-TEST');
  await page.locator('#newIncAccount').selectOption('');
  await page.locator('#newIncAmount').fill('2713.45');
  await page.locator('button[onclick="addIncome()"]').click();
  await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue('SAVE-RELOAD-TEST');
  await page.reload();
  await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue('SAVE-RELOAD-TEST');
  await expect(page.locator('#incomeBody input[aria-label="Income amount"]').first()).toHaveValue('2713.45');
  await expect(page.locator('#incTotalBadge')).toHaveText('$2,713.45');
});

test('authenticated storage is owner-scoped and existing browser keys are preserved', async ({ page }) => {
  await page.locator('#newIncName').fill('Stored');
  await page.locator('#newIncAccount').selectOption('');
  await page.locator('#newIncAmount').fill('10');
  await page.locator('button[onclick="addIncome()"]').click();
  const result = await page.evaluate(() => Object.keys(localStorage));
  expect(result.some(key => key.startsWith('rollingbudget_staging_phiscfwfuzeptetimdbo_browser-test-owner_budget_'))).toBe(true);
  expect(result.some(key => key.includes('_guest_budget_'))).toBe(false);
});

test('user-entered markup is rendered as text, not executable HTML', async ({ page }) => {
  const payload = '<img src=x onerror=alert(1)>';
  await page.locator('#newVarName').fill(payload);
  await page.locator('#newVarDue').selectOption('4');
  await page.locator('#newVarAmt').fill('25');
  await page.evaluate(() => addExpense('variable'));
  await expect(page.locator('#variableBody input:not([type])').first()).toHaveValue(payload);
  await expect(page.locator('#variableBody img')).toHaveCount(0);
});

test('desktop recurring manager provides a route back to the budget overview', async ({ page }) => {
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopSettingsPanel')).toBeVisible();
  await page.locator('#desktopRecurringButton').click();
  await expect(page.locator('#recurringManagerPage')).toBeVisible();
  await expect(page.locator('header')).toBeVisible();
  const backButton = page.getByRole('button', { name: '← Back to Overview' });
  await expect(backButton).toBeVisible();
  await expect(page.locator('.toggle-pill')).toHaveCSS('color', 'rgb(24, 19, 38)');
  await backButton.click();
  await expect(page.locator('#recurringManagerPage')).toBeHidden();
  await page.locator('#desktopBudgetButton').click();
  await expect(page.locator('.main-grid')).toBeVisible();
  await page.locator('#desktopSettingsButton').click();
  await page.locator('[data-settings-section="automation"]').click();
  await expect(page.locator('#desktopSettingsPanel button[onclick="openRecurringModal()"]')).toHaveCount(0);
  await expect(page.locator('#desktopRecurringButton')).toBeVisible();
});

test('desktop Settings omits years while direct budget year selection remains available', async ({ page }) => {
  const nextYear = String(new Date().getFullYear() + 1);
  await expect(page.locator('#activeYearSelect')).toBeVisible();
  await page.locator('#activeYearSelect').selectOption(nextYear);
  await expect(page.locator('#activeYearSelect')).toHaveValue(nextYear);
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopSettingsButton')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#settingsAccounts')).toBeVisible();
  await expect(page.locator('#settingsYears')).toHaveCount(0);
  await expect(page.locator('[data-settings-section="years"]')).toHaveCount(0);
  await expect(page.locator('#activeYearSelect')).toBeHidden();
  await page.locator('[data-settings-section="automation"]').click();
  await expect(page.locator('#autoRollToggle')).toBeVisible();
  await expect(page.locator('#desktopSettingsPanel button[onclick="openRecurringModal()"]')).toHaveCount(0);
  await expect(page.locator('#desktopRecurringButton')).toBeVisible();
  await page.locator('#desktopBudgetButton').click();
  await expect(page.locator('#desktopSettingsPanel')).toBeHidden();
  await expect(page.locator('#activeYearSelect')).toHaveValue(nextYear);
  await expect(page.locator('#activeYearSelect')).toBeVisible();
});

test('desktop recurring rule dates are saved and automatically backfilled without duplicates', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Quarterly Internet');
  await form.locator('[data-rec-field="amount"]').fill('80');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-10');
  await form.locator('[data-rec-field="endDate"]').fill('2026-12-31');
  await form.locator('[data-rec-field="frequency"]').selectOption('quarterly');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect(page.locator('#desktopRulesList')).toContainText('Quarterly Internet');
  await expect(page.locator('#desktopRulesList')).toContainText('2026-01-10');
  await expect.poll(() => page.evaluate(() => db['2026'].months.map(m =>
    m.fixed.filter(x => x.name === 'Quarterly Internet').length)))
    .toEqual([1,0,0,1,0,0,1,0,0,1,0,0]);
  const count = await page.evaluate(() => db['2026'].months.flatMap(m => m.fixed).filter(x => x.name === 'Quarterly Internet').length);
  await page.reload();
  expect(await page.evaluate(() => db['2026'].months.flatMap(m => m.fixed).filter(x => x.name === 'Quarterly Internet').length)).toBe(count);
  await page.locator('#desktopRecurringButton').click();
  await page.locator('#desktopRulesList button').filter({ hasText: 'Disable' }).click();
  await expect(page.locator('#desktopRulesList')).toContainText('Disabled');
  expect(await page.evaluate(() => db['2026'].months.flatMap(m => m.fixed).filter(x => x.name === 'Quarterly Internet').length)).toBe(count);
});
test('legacy rule definitions are retired while existing budget entries remain intact', async ({ page }) => {
  await page.evaluate(async () => {
    db[activeYear].recurringRules = [{ id: 123, cat: 'fixed', name: 'Legacy Rent', amount: 900, due: '1st', start: 0, end: 11 }];
    db[activeYear].months[0].fixed.push({ name: 'Legacy Rent', due: '1st', amount: 900 });
    await saveDB();
  });
  await page.locator('#desktopSettingsButton').click();
  await page.locator('#desktopRecurringButton').click();
  await expect(page.locator('#desktopRulesList')).not.toContainText('Legacy Rent');
  const entries = await page.evaluate(() => db[activeYear].months[0].fixed.filter(x => x.name === 'Legacy Rent'));
  expect(entries).toHaveLength(1);
});

test('mobile year selection is directly accessible and fits narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#mobileActiveYearSelect')).toBeVisible();
  await expect(page.locator('#activeYearSelect')).toBeHidden();
  await expect(page.locator('#mobileSettingsMenu')).toBeHidden();
  await page.locator('#mobileActiveYearSelect').selectOption(String(new Date().getFullYear() + 1));
  await expect(page.locator('#mobileOverview')).toContainText(String(new Date().getFullYear() + 1));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('rolling future years are selectable without creating empty cloud records', async ({ page }) => {
  const current = new Date().getFullYear();
  const expected = [current, current + 1, current + 2].map(String);
  expect(await page.locator('#activeYearSelect option').evaluateAll(options => options.map(option => option.value))).toEqual(expected);
  const before = await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')));
  await page.locator('#activeYearSelect').selectOption(String(current + 2));
  await page.reload();
  await expect(page.locator('#activeYearSelect')).toHaveValue(String(current + 2));
  expect(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')))).toEqual(before);
});

test('desktop header uses the approved email branding', async ({ page }) => {
  const brand = page.locator('header .title-group');
  await expect(brand.locator('h1')).toHaveText('Rolling Budget');
  await expect(brand.locator('p')).toHaveText('Logged in as browser-test@example.invalid');
  await expect(brand.locator('.brand-bar')).toHaveCount(3);
  await expect(brand.locator('.brand-bar-short')).toHaveCSS('background-color', 'rgb(139, 124, 255)');
  await expect(brand.locator('.brand-bar-tall')).toHaveCSS('background-color', 'rgb(177, 166, 255)');
  await expect(page.locator('header')).toHaveCSS('background-color', 'rgb(23, 21, 43)');
  await expect(page.locator('#authBtn')).toBeVisible();
  await expect(page.locator('#authBtn')).toHaveText('Sign Out');
});


test('brand guidelines document the approved logo, palette, and typography', async () => {
  const guidelines = readFileSync(new URL('../../docs/BRAND_GUIDELINES.md', import.meta.url), 'utf8');
  expect(guidelines).toContain('Plan smarter. Grow stronger.');
  expect(guidelines).toContain('`#8B7CFF`');
  expect(guidelines).toContain('`#B1A6FF`');
  expect(guidelines).toContain('`#17152B`');
  expect(guidelines).toContain('"Inter"');
});

test('desktop sign-out revokes access and returns to public homepage', async ({ page }) => {
  await queueBrandedResponse(page);
  await page.locator('#authBtn').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /Make room for what matters/i })).toBeVisible();
  await expect(page.locator('#incomeBody')).toHaveCount(0);
});

test('cancelling desktop sign-out keeps the authenticated budget visible', async ({ page }) => {
  await queueBrandedResponse(page, 'cancel');
  await page.locator('#authBtn').click();
  await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
  await expect(page.locator('#authBtn')).toHaveText('Sign Out');
  await expect(page.locator('#incTotalBadge')).toBeVisible();
});

test('legacy mixed income migrates automatically once and survives reload', async ({ page }) => {
  await page.evaluate(() => selectMonth(0));
  await page.evaluate(async () => {
    sessionStorage.setItem('__mock_legacy_accounts', '1');
    db[activeYear].months[0].income = [{ name: 'Legacy Pay', cpm: 200, usaa: 300, recurringRuleId: 'legacy-rule' }];
    await saveDB();
  });
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect.poll(() => page.evaluate(() => db[activeYear]?.months?.[0]?.income?.length)).toBe(2);
  await page.evaluate(() => selectMonth(0));
  // The rollover summary row has its own numeric input; target income entry rows only.
  const migratedNames = page.locator('#incomeBody tr:not(.roll-row) input.inline-input:not([type])');
  await expect(migratedNames).toHaveCount(2);
  await expect(migratedNames.nth(0)).toHaveValue('Legacy Pay');
  await expect(migratedNames.nth(1)).toHaveValue('Legacy Pay');
  await expect(page.locator('#incTotalBadge')).toHaveText('$500.00');
  const read = () => page.evaluate(() => db[activeYear].months[0].income);
  const entries = await read();
  expect(entries).toEqual([
    { name: 'Legacy Pay', accountId: 'cpm', amount: 200, recurringRuleId: 'legacy-rule' },
    { name: 'Legacy Pay', accountId: 'usaa', amount: 300, recurringRuleId: 'legacy-rule' }
  ]);
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect.poll(read).toEqual(entries);
  await expect(page.locator('#incomeBody button', { hasText: 'Split income' })).toHaveCount(0);
});

test('unassigned income amount can be edited and persists after reload', async ({ page }) => {
  await page.locator('#newIncName').fill('Edited Pay');
  await page.locator('#newIncAccount').selectOption('');
  await page.locator('#newIncAmount').fill('200');
  await page.locator('button[onclick="addIncome()"]').click();
  const amount = page.locator('#incomeBody input[aria-label="Income amount"]').first();
  await expect(amount).toBeEnabled();
  await amount.fill('350');
  await amount.press('Tab');
  await expect(page.locator('#incTotalBadge')).toHaveText('$350.00');
  await page.reload();
  await expect(page.locator('#incomeBody input[aria-label="Income amount"]').first()).toHaveValue('350');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('desktop primary navigation and year selection retain shared budget state', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(nav.locator('button')).toHaveText(['Overview', 'Budget', 'Recurring Rules', 'Settings']);
  await page.locator('#activeYearSelect').selectOption(String(new Date().getFullYear() + 1));
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#settingsAccounts')).toBeVisible();
  await expect(page.locator('#settingsYears')).toHaveCount(0);
  await expect(page.locator('#settingsAutomation')).toBeHidden();
  await page.locator('#desktopRecurringButton').click();
  await expect(page.locator('#recurringManagerPage')).toBeVisible();
  await page.locator('#desktopBudgetButton').click();
  await expect(page.locator('#recurringManagerPage')).toBeHidden();
  await expect(page.locator('#rollingStrip')).toBeVisible();
  await expect(page.locator('#activeYearSelect')).toHaveValue(String(new Date().getFullYear() + 1));
});

test('account exclusions update dashboard totals without removing entries on desktop or mobile', async ({ page }) => {
  await page.evaluate(() => selectMonth(0));
  await page.evaluate(() => {
    const month = db[activeYear].months[0];
    budgetAccounts = [{ id: 'checking', name: 'Checking', included: true }, { id: 'savings', name: 'Savings', included: false }];
    month.income.push({ name: 'Included pay', accountId: 'checking', amount: 400 });
    month.income.push({ name: 'Excluded pay', accountId: 'savings', amount: 500 });
    month.fixed.push({ name: 'Excluded rent', accountId: 'savings', amount: 100, due: '1st' });
    budgetAccounts = budgetAccounts.map(account => ({ ...account, included: account.id !== 'savings' }));
    renderAccounts();
    render();
  });
  await expect(page.locator('#incTotalBadge')).toHaveText('$400.00');
  await expect(page.locator('#fixTotalBadge')).toHaveText('$0.00');
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopAccountsManager [data-account-action="included"][data-account-id="savings"]')).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Budget Accounts' }).click();
  await expect(page.locator('#mobileSettingsAccounts [data-account-action="included"][data-account-id="savings"]')).not.toBeChecked();
  await page.evaluate(() => {
    budgetAccounts = budgetAccounts.map(account => ({ ...account, included: true }));
    renderAccounts();
    render();
  });
  await expect(page.locator('#mobileSettingsAccounts [data-account-action="included"][data-account-id="savings"]')).toBeChecked();
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="overview"]').click();
  await expect(page.locator('#mobileOverview')).toContainText('$900.00');
  expect(await page.evaluate(() => db[activeYear].months[0].income.length)).toBe(2);
});

test('new users see no default accounts on desktop and mobile', async ({ page }) => {
  await expect(page.locator('#newIncAccount option')).toHaveCount(1);
  await expect(page.locator('#newIncAccount')).toHaveValue('');
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopAccountsManager')).toContainText('No accounts yet.');
  await expect(page.locator('#desktopAccountsManager [data-account-id]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobileMenuButton').click();
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Budget Accounts' }).click();
  await expect(page.locator('#mobileSettingsAccounts')).toContainText('No accounts yet.');
  await expect(page.locator('#mobileSettingsAccounts [data-account-id]')).toHaveCount(0);
});

test('desktop recurring manager does not expose removed preview actions or due-day fields', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await expect(form.locator('[data-rec-field="startDate"]')).toBeVisible();
  await expect(form.locator('[data-rec-field="endDate"]')).toBeVisible();
  await expect(form.locator('[data-rec-field="due"], [data-rec-field="startMonth"]')).toHaveCount(0);
  await expect(page.locator('#desktopApplyRecurringPreview, #desktopRecurringPreviewStatus')).toHaveCount(0);
});
test('stale ordinary budget save cannot overwrite a newer cloud revision', async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const year = activeYear;
    const cloud = { year: Number(year), budget_data: structuredClone(db[year]),
      updated_at: '2026-11-15T12:00:00.000Z' };
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify({ [year]: cloud }));
    cloudBudgetVersions.set(currentUser.id + ':' + year, '2026-11-15T11:00:00.000Z');
    db[year].months[0].fixed.push({ name: 'Unsynced local edit', amount: 19 });
    const status = await saveDB();
    const after = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))[year];
    return { status, cloud: after.budget_data.months[0].fixed, revision: after.updated_at,
      local: db[year].months[0].fixed };
  });
  expect(outcome.status).toBe('local-saved');
  expect(outcome.cloud).toEqual([]);
  expect(outcome.revision).toBe('2026-11-15T12:00:00.000Z');
  expect(outcome.local).toContainEqual({ name: 'Unsynced local edit', amount: 19 });
});

test('desktop preserves an unresolved cloud conflict across reload and offers explicit recovery', async ({ page }) => {
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
  await queueBrandedResponse(page);
  await page.locator('#cloudSaveStatus button').filter({ hasText: 'Use cloud version' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem(conflictStorageKey(activeYear)))).toBe(null);
  expect(await page.evaluate(() => db[activeYear].months[0].fixed.some(
    entry => entry.name === 'Local unsynced entry'))).toBe(false);
  expect(await page.evaluate(() => Boolean(localStorage.getItem(storageKey(activeYear) + '_conflict_backup')))).toBe(true);
});


test('desktop rejects malformed cloud reconciliation without replacing local expenses', async ({ page }) => {
  const year = await page.evaluate(async () => {
    const y = activeYear;
    db[y].months[0].fixed.push({ name: 'Preserve me', amount: 41 });
    await saveDB();
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'));
    rows[y].budget_data = { months: [] };
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
    markCloudConflict(currentUser.id + ':' + y, y);
    showCloudSaveStatus('Unsynced local budget changes require reconciliation.');
    return y;
  });
  await queueBrandedResponse(page);
  await page.locator('#cloudSaveStatus button').filter({ hasText: 'Use cloud version' }).click();
  await expect(page.locator('#cloudSaveStatus')).toContainText('Cloud budget is invalid');
  const result = await page.evaluate(y => ({
    names: db[y].months[0].fixed.map(item => item.name),
    marker: localStorage.getItem(conflictStorageKey(y)),
    cached: JSON.parse(localStorage.getItem(storageKey(y))).data.months[0].fixed.map(item => item.name)
  }), year);
  expect(result).toEqual({ names: ['Preserve me'], marker: '1', cached: ['Preserve me'] });
});

test('desktop refuses destructive reconciliation when the local backup cannot be written', async ({ page }) => {
  await page.evaluate(async () => {
    const y = activeYear;
    db[y].months[0].fixed.push({ name: 'Protected backup', amount: 19 });
    await saveDB();
    markCloudConflict(currentUser.id + ':' + y, y);
    showCloudSaveStatus('Unsynced local budget changes require reconciliation.');
    window.__originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === storageKey(y) + '_conflict_backup') throw new DOMException('Storage full', 'QuotaExceededError');
      return window.__originalStorageSetItem.call(this, key, value);
    };
  });
  await queueBrandedResponse(page);
  await page.locator('#cloudSaveStatus button').filter({ hasText: 'Use cloud version' }).click();
  await expect(page.locator('#cloudSaveStatus')).toContainText('Reconciliation failed');
  const result = await page.evaluate(() => ({
    marker: localStorage.getItem(conflictStorageKey(activeYear)),
    names: db[activeYear].months[0].fixed.map(item => item.name)
  }));
  expect(result).toEqual({ marker: '1', names: ['Protected backup'] });
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSetItem; });
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

test('desktop explicitly keeping local changes resolves a conflict with conditional cloud update', async ({ page }) => {
  await page.evaluate(async () => {
    const year = activeYear, key = currentUser.id + ':' + year;
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify({
      [year]: { year: Number(year), budget_data: structuredClone(db[year]),
        updated_at: '2026-11-15T12:00:00.000Z' }
    }));
    cloudBudgetVersions.set(key, '2026-11-15T11:00:00.000Z');
    db[year].months[0].fixed.push({ name: 'Keep local', amount: 42 });
    await saveDB();
  });
  await queueBrandedResponse(page);
  await page.locator('#cloudSaveStatus button').filter({ hasText: 'Keep local changes' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem(conflictStorageKey(activeYear)))).toBe(null);
  const result = await page.evaluate(() => {
    const row = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))[activeYear];
    return { present: row.budget_data.months[0].fixed.some(item => item.name === 'Keep local'),
      backup: Boolean(localStorage.getItem(storageKey(activeYear) + '_conflict_backup')) };
  });
  expect(result).toEqual({ present: true, backup: true });
});


test('desktop overview defaults to current month or January and restores manual year selection', async ({ page }) => {
  const initial = await page.evaluate(() => ({ year: activeYear, month: selectedIdx, nowYear: new Date().getFullYear(), nowMonth: new Date().getMonth() }));
  expect(initial.month).toBe(initial.year === String(initial.nowYear) ? initial.nowMonth : 0);
  await page.evaluate(() => selectMonth(4));
  await page.evaluate(() => render());
  expect(await page.evaluate(() => selectedIdx)).toBe(4);
  const otherYear = String(initial.nowYear === 2026 ? 2027 : 2026);
  await page.evaluate(year => switchYear(year), otherYear);
  expect(await page.evaluate(() => selectedIdx)).toBe(0);
  await page.evaluate(year => switchYear(year), String(initial.nowYear));
  expect(await page.evaluate(() => selectedIdx)).toBe(4);
});

test('recurring manager heading is global and contains no budget year', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  await expect(page.locator('.recurring-eyebrow')).toHaveText('RECURRING RULES');
  await expect(page.locator('#recurringYearLabel')).toHaveCount(0);
});

test('automatic recurring backfill saves only the selected budget year, not unused templates', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Selected year only');
  await form.locator('[data-rec-field="amount"]').fill('50');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-15');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[0].fixed.filter(
    entry => entry.name === 'Selected year only').length)).toBe(1);
  const years = await page.evaluate(() =>
    Object.keys(JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')).sort());
  expect(years).toEqual(['2026']);
});

test('recurring cloud synchronization cannot replace unsaved local desktop changes', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Protected rent');
  await form.locator('[data-rec-field="amount"]').fill('100');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-01');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[0].fixed.filter(
    entry => entry.name === 'Protected rent').length)).toBe(1);
  const original = await page.evaluate(() => {
    const cloud = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))['2026'];
    db['2026'].months[2].fixed.push({ name: 'Locally edited only', amount: 44 });
    return { revision: cloud.updated_at, budget: cloud.budget_data };
  });
  await queueBrandedResponse(page);
  await page.evaluate(() => backfillSavedRecurringYears(currentUser.id, '2026-01-01'));
  const after = await page.evaluate(() => ({
    cloud: JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))['2026'],
    conflict: localStorage.getItem(conflictStorageKey('2026')),
    local: db['2026'].months[2].fixed.some(entry => entry.name === 'Locally edited only')
  }));
  expect(after.cloud.updated_at).toBe(original.revision);
  expect(after.cloud.budget_data).toEqual(original.budget);
  expect(after.local).toBe(true);
  expect(after.conflict).toBe('1');
});

test('cloud fixture discovers only explicitly saved years for the authenticated owner', async ({ page }) => {
  const initial = await page.evaluate(async () =>
    supabaseClient.from('budget_ui_years').select('year,updated_at').eq('user_id', currentUser.id));
  expect(initial.data).toEqual([]);
  expect(await page.evaluate(() => saveDB())).toBe('cloud-saved');
  const rows = await page.evaluate(async () => {
    const own = await supabaseClient.from('budget_ui_years').select('year,updated_at').eq('user_id', currentUser.id);
    const other = await supabaseClient.from('budget_ui_years').select('year,updated_at').eq('user_id', 'other-owner');
    return { own: own.data.map(row => row.year), other: other.data };
  });
  expect(rows).toEqual({ own: [2026], other: [] });
});

test('desktop edit only fills missing future entries and preserves existing amounts', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Future price edit');
  await form.locator('[data-rec-field="amount"]').fill('100');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-01');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[11].fixed.filter(
    entry => entry.name === 'Future price edit').length)).toBe(1);
  await page.evaluate(() => {
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'));
    rows['2026'].budget_data.months[11].fixed =
      rows['2026'].budget_data.months[11].fixed.filter(x => x.name !== 'Future price edit');
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
    db['2026'] = structuredClone(rows['2026'].budget_data);
    localStorage.setItem(storageKey('2026'), JSON.stringify({
      data: db['2026'], updatedAt: rows['2026'].updated_at
    }));
  });
  await queueBrandedResponses(page, [
    { decision: 'accept', value: '150' },
    { decision: 'accept', value: 'monthly' }
  ]);
  await page.locator('#desktopRulesList button').filter({ hasText: 'Edit' }).click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[11].fixed.filter(
    entry => entry.name === 'Future price edit').map(entry => entry.amount))).toEqual([150]);
  const state = await page.evaluate(() => ({
    january: db['2026'].months[0].fixed.filter(x => x.name === 'Future price edit').map(x => x.amount),
    november: db['2026'].months[10].fixed.filter(x => x.name === 'Future price edit').map(x => x.amount),
    december: db['2026'].months[11].fixed.filter(x => x.name === 'Future price edit').map(x => x.amount),
    version: JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules'))[0].versions.at(-1)
  }));
  expect(state.january).toEqual([100]);
  expect(state.november).toEqual([100]);
  expect(state.december).toEqual([150]);
  expect(state.version.effectiveFrom).toBe('2026-12-01');
  expect(state.version.amount).toBe(150);
  await expect(page.locator('#desktopRulesList')).toContainText('Scheduled from 2026-12-01');
  await page.reload();
  await expectAuthenticatedBudget(page);
  // Cloud year restoration is asynchronous; assert the persisted result after load completes.
  await expect.poll(() => page.evaluate(() => db['2026']?.months?.[11]?.fixed.filter(
    x => x.name === 'Future price edit').map(x => x.amount) ?? [])).toEqual([150]);
});

test('first edit in a virtual future year saves it and safely applies global recurring rules', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Future year payment');
  await form.locator('[data-rec-field="amount"]').fill('45');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-15');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[0].fixed.filter(
    entry => entry.name === 'Future year payment').length)).toBe(1);
  await page.locator('#desktopBudgetButton').click();
  const targetYear = String(new Date().getFullYear() + 2);
  await page.locator('#activeYearSelect').selectOption(targetYear);
  expect(await page.evaluate(year => JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')[year] || null, targetYear)).toBe(null);
  await page.evaluate(async year => {
    db[year].months[0].fixed.push({ id: 'future-note', name: 'First future edit', amount: 1, due: '1st' });
    await saveDB();
  }, targetYear);
  await expect.poll(() => page.evaluate(year => db[year].months[0].fixed.filter(
    entry => entry.name === 'Future year payment').length, targetYear)).toBe(1);
  const state = await page.evaluate(year => ({
    saved: Boolean(JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')[year]),
    count: db[year].months.flatMap(month => month.fixed).filter(x => x.name === 'Future year payment').length,
    includedManual: db[year].months[0].fixed.some(x => x.name === 'First future edit')
  }), targetYear);
  expect(state).toEqual({ saved: true, count: 12, includedManual: true });
});

test('desktop recurring sync reports added entries and skips existing entries without offering retry', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Sync result expense');
  await form.locator('[data-rec-field="amount"]').fill('19');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-05');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect(page.locator('#desktopRecurringSyncStatus')).toContainText('Recurring synchronization complete: 12 entries added');
  await expect(page.locator('#desktopRecurringSyncDetails')).toContainText('2026: 12 added');
  await expect(page.locator('#desktopRetryRecurringSync')).toBeHidden();
  await page.evaluate(() => backfillSavedRecurringYears(currentUser.id, '2026-01-05'));
  await expect(page.locator('#desktopRecurringSyncStatus')).toContainText('0 entries added');
  await expect(page.locator('#desktopRecurringSyncDetails')).toContainText('12 already present');
  expect(await page.evaluate(() => db['2026'].months.flatMap(m => m.fixed)
    .filter(x => x.name === 'Sync result expense').length)).toBe(12);
});

test('desktop recurring retry recovers from a transient cloud error without replaying entries', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Retry protected entry');
  await form.locator('[data-rec-field="amount"]').fill('81');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-15');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[0].fixed
    .some(x => x.name === 'Retry protected entry'))).toBe(true);
  await page.evaluate(() => {
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'));
    rows['2026'].budget_data.months[11].fixed =
      rows['2026'].budget_data.months[11].fixed.filter(x => x.name !== 'Retry protected entry');
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
    db['2026'] = structuredClone(rows['2026'].budget_data);
    localStorage.setItem(storageKey('2026'), JSON.stringify({
      data: db['2026'], updatedAt: rows['2026'].updated_at
    }));
    sessionStorage.setItem('__mock_budget_cloud_failure', '1');
  });
  await page.evaluate(() => backfillSavedRecurringYears(currentUser.id, '2026-01-15'));
  await expect(page.locator('#desktopRecurringSyncStatus')).toContainText('synchronization incomplete');
  await expect(page.locator('#desktopRetryRecurringSync')).toBeVisible();
  expect(await page.evaluate(() => db['2026'].months[11].fixed
    .filter(x => x.name === 'Retry protected entry').length)).toBe(0);
  await page.reload();
  await page.locator('#desktopRecurringButton').click();
  await expect(page.locator('#desktopRetryRecurringSync')).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('__mock_budget_cloud_failure'));
  // Reload can resume pending synchronization automatically. A disappearing
  // retry control is valid only when the missing entry has been restored.
  const retry = page.locator('#desktopRetryRecurringSync');
  const recovered = () => page.evaluate(() => db['2026'].months[11].fixed
    .filter(x => x.name === 'Retry protected entry').length);
  if (await recovered() === 0) {
    try {
      await retry.click({ timeout: 3000 });
    } catch (error) {
      if (await recovered() !== 1) throw error;
    }
  }
  await expect.poll(recovered).toBe(1);
  await expect(page.locator('#desktopRetryRecurringSync')).toBeHidden();
  await expect(page.locator('#desktopRecurringSyncStatus')).toContainText('Recurring synchronization complete');
  expect(await page.evaluate(() => db['2026'].months.flatMap(m => m.fixed)
    .filter(x => x.name === 'Retry protected entry').length)).toBe(12);
});

test('desktop recurring backfill accepts PostgreSQL-style jsonb ordering and timestamp formatting', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Jsonb-safe recurring');
  await form.locator('[data-rec-field="amount"]').fill('74');
  await form.locator('[data-rec-field="startDate"]').fill('2026-01-15');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[11].fixed.filter(
    item => item.name === 'Jsonb-safe recurring').length)).toBe(1);
  const formatting = await page.evaluate(() => {
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'));
    const cloud = rows['2026'];
    const originalRevision = cloud.updated_at;
    const document = structuredClone(cloud.budget_data);
    document.months[11].fixed = document.months[11].fixed.filter(item =>
      item.name !== 'Jsonb-safe recurring');
    db['2026'] = document;
    localStorage.setItem(storageKey('2026'), JSON.stringify({
      data: document, updatedAt: originalRevision
    }));
    const jsonb = value => Array.isArray(value)
      ? value.map(jsonb)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, jsonb(value[key])]))
        : value;
    cloud.budget_data = jsonb(document);
    cloud.updated_at = originalRevision.replace(/Z$/, '+00:00');
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
    return {
      local: JSON.stringify(document),
      remote: JSON.stringify(cloud.budget_data),
      beforeRevision: originalRevision,
      remoteRevision: cloud.updated_at
    };
  });
  expect(formatting.local).not.toBe(formatting.remote);
  expect(formatting.beforeRevision).not.toBe(formatting.remoteRevision);
  await page.evaluate(() => backfillSavedRecurringYears(currentUser.id, '2026-01-15'));
  await expect.poll(() => page.evaluate(() => db['2026'].months[11].fixed.filter(
    item => item.name === 'Jsonb-safe recurring').length)).toBe(1);
  expect(await page.evaluate(() => db['2026'].months.flatMap(month => month.fixed).filter(
    item => item.name === 'Jsonb-safe recurring').length)).toBe(12);
  expect(await page.evaluate(() => localStorage.getItem(conflictStorageKey('2026')))).toBe(null);
  await expect(page.locator('#desktopRecurringSyncStatus')).toContainText('1 entries added');
});

test('desktop recurring form only shows start and optional end dates', async ({ page }) => {
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await expect(form.getByLabel('Start date')).toBeVisible();
  await expect(form.getByLabel('End date (optional)')).toBeVisible();
  await expect(form.getByLabel(/Due day|Start month/i)).toHaveCount(0);
  await expect(form.locator('[data-rec-field="due"], [data-rec-field="startMonth"]')).toHaveCount(0);
});

test('desktop plan copy confirms, skips recurring entries, persists and prevents overwrites', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year)+1);
  await page.evaluate(async y => { db[y].months[0].fixed.push({name:'Rent plan',amount:900,dueDay:1}); db[y].months[0].fixed.push({name:'Generated',amount:30,occurrenceId:'occ',recurringRuleId:'rule'}); await saveDB(); }, year);
  await page.locator('#activeYearSelect').selectOption(next);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeVisible();
  await queueBrandedResponse(page, 'cancel');
  await page.locator('#desktopCopyPreviousYear').click();
  await expect.poll(() => page.evaluate(() => window.__brandedDialogSeen.length)).toBe(1);
  expect(await page.evaluate(y => db[y].months[0].fixed.length, next)).toBe(0);
  await queueBrandedResponse(page);
  await page.locator('#desktopCopyPreviousYear').click();
  await expect.poll(() => page.evaluate(() => window.__brandedDialogSeen.length)).toBe(1);
  await expect.poll(() => page.evaluate(y => db[y].months[0].fixed.map(e => e.name), next)).toEqual(['Rent plan']);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeHidden();
  await page.reload();
  await expect(page.locator('#activeYearSelect')).toHaveValue(next);
  expect(await page.evaluate(y => db[y].months[0].fixed[0].name, next)).toBe('Rent plan');
});


test('desktop blocks copying and January projection from a conflicted source year', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year) + 1);
  await page.evaluate(async y => {
    db[y].months[0].fixed.push({ name: 'Protected source', amount: 45 });
    await saveDB();
  }, year);
  await page.locator('#activeYearSelect').selectOption(next);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeVisible();
  await expect(page.locator('#desktopProjectJanuary')).toBeVisible();
  await page.evaluate(y => { markCloudConflict(currentUser.id + ':' + y, y); render(); }, year);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeHidden();
  await expect(page.locator('#desktopProjectJanuary')).toBeHidden();
  expect(await page.evaluate(y => db[y].months[0].fixed.length, next)).toBe(0);
});

test('desktop detects a stale source cloud revision before copying', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year) + 1);
  await page.evaluate(async y => {
    db[y].months[0].fixed.push({ name: 'Protected plan', amount: 75 });
    await saveDB();
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'));
    rows[y].updated_at = '2099-01-01T00:00:00.000Z';
    rows[y].budget_data.months[0].fixed[0].amount = 99;
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
  }, year);
  await page.locator('#activeYearSelect').selectOption(next);
  await queueBrandedResponse(page);
  await page.locator('#desktopCopyPreviousYear').click();
  await expect(page.locator('#cloudSaveStatus')).toContainText('previous budget year');
  await expect(page.locator('#desktopCopyPreviousYear')).toBeHidden();
  expect(await page.evaluate(y => db[y].months[0].fixed, next)).toEqual([]);
});

test('copy action is hidden for conflicted target years', async ({ page }) => {
  const year=String(new Date().getFullYear());
  await page.evaluate(async y => { db[y].months[0].income.push({name:'Salary',amount:1000}); await saveDB(); }, year);
  await page.locator('#activeYearSelect').selectOption(String(Number(year)+1));
  await expect(page.locator('#desktopCopyPreviousYear')).toBeVisible();
  await page.evaluate(() => { markCloudConflict(currentUser.id+':'+activeYear,activeYear);render(); });
  await expect(page.locator('#desktopCopyPreviousYear')).toBeHidden();
});


test('desktop January rollover is opt-in and preserves manual opening balances', async ({ page }) => {
  const year=String(new Date().getFullYear()),next=String(Number(year)+1);
  await page.evaluate(async y => {
    db[y].months[11].income.push({name:'December pay',amount:500,accountId:null});
    db[y].months[11].fixed.push({name:'December bill',amount:200});
    await saveDB();
    render();
  },year);
  await page.locator('#activeYearSelect').selectOption(next);
  await expect(page.locator('#desktopProjectJanuary')).toBeVisible();
  await queueBrandedResponse(page, 'cancel');
  await page.locator('#desktopProjectJanuary').click();
  await expect.poll(() => page.evaluate(() => window.__brandedDialogSeen.length)).toBe(1);
  expect(await page.evaluate(y => db[y].months[0].recordedLeftover,next)).toBe(0);
  await queueBrandedResponse(page);
  await page.locator('#desktopProjectJanuary').click();
  await expect.poll(() => page.evaluate(() => window.__brandedDialogSeen.length)).toBe(1);
  await expect.poll(() => page.evaluate(y => db[y].months[0].recordedLeftover,next)).toBe(300);
  await expect(page.locator('#desktopProjectJanuary')).toBeHidden();
  await page.reload();
  await expect(page.locator('#activeYearSelect')).toHaveValue(next);
  expect(await page.evaluate(y => db[y].months[0].recordedLeftover,next)).toBe(300);
});

test('failed browser storage rolls back a plan copy without claiming it was saved', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year) + 1);
  await page.evaluate(async y => { db[y].months[0].fixed.push({ name: 'Rent plan', amount: 900 }); await saveDB(); render(); }, year);
  await page.locator('#activeYearSelect').selectOption(next);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeVisible();
  await page.evaluate(() => {
    window.__storageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === storageKey(activeYear)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return window.__storageSetItem.call(this, key, value);
    };
  });
  await queueBrandedResponse(page);
  await page.locator('#desktopCopyPreviousYear').click();
  await expect(page.locator('#cloudSaveStatus')).toContainText('was not saved');
  const result = await page.evaluate(y => ({
    entries: db[y].months[0].fixed,
    cloud: JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')[y] || null
  }), next);
  expect(result).toEqual({ entries: [], cloud: null });
  await expect(page.locator('#desktopCopyPreviousYear')).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = window.__storageSetItem; });
  await page.locator('#desktopCopyPreviousYear').click();
  await expect.poll(() => page.evaluate(y => db[y].months[0].fixed[0]?.name, next)).toBe('Rent plan');
});

test('January first save backfills rules before a manual plan copy without duplicates', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year) + 1);
  await page.evaluate(y => {
    db[y].months[0].fixed.push({ name: 'Manual insurance', amount: 125, due: '7th' });
    db[y].months[11].income.push({ name: 'December bonus', amount: 1000 });
    render();
  }, year);
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Auto subscription');
  await form.locator('[data-rec-field="amount"]').fill('15');
  await form.locator('[data-rec-field="startDate"]').fill(year + '-01-15');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(y => db[y].months[0].fixed.some(
    entry => entry.name === 'Auto subscription'), year)).toBe(true);
  await page.locator('#desktopBudgetButton').click();
  await page.locator('#activeYearSelect').selectOption(next);
  await queueBrandedResponse(page);
  await page.locator('#desktopProjectJanuary').click();
  await expect.poll(() => page.evaluate(y => db[y].months.flatMap(month => month.fixed)
    .filter(entry => entry.name === 'Auto subscription').length, next)).toBe(12);
  const opening = await page.evaluate(y => db[y].months[0].recordedLeftover, next);
  expect(opening).not.toBe(0);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeVisible();
  await page.locator('#desktopCopyPreviousYear').click();
  await expect.poll(() => page.evaluate(y => db[y].months[0].fixed.some(
    entry => entry.name === 'Manual insurance'), next)).toBe(true);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeHidden();
  await page.evaluate(y => backfillSavedRecurringYears(currentUser.id, y + '-01-01', y + '-12-31'), next);
  const state = await page.evaluate(y => ({
    opening: db[y].months[0].recordedLeftover,
    recurring: db[y].months.flatMap(m => m.fixed).filter(e => e.name === 'Auto subscription').length,
    manual: db[y].months.flatMap(m => m.fixed).filter(e => e.name === 'Manual insurance').length
  }), next);
  expect(state).toEqual({ opening, recurring: 12, manual: 1 });
  await page.reload();
  await expect(page.locator('#activeYearSelect')).toHaveValue(next);
  expect(await page.evaluate(y => db[y].months[0].fixed.map(e => e.name).sort(), next))
    .toEqual(['Auto subscription', 'Manual insurance']);
});

test('failed first cloud save reconciles local plan and backfills recurring rules exactly once', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year) + 1);
  await page.evaluate(y => { db[y].months[0].variable.push({ name: 'Manual groceries', amount: 85 }); render(); }, year);
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Auto rent');
  await form.locator('[data-rec-field="amount"]').fill('500');
  await form.locator('[data-rec-field="startDate"]').fill(year + '-01-01');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(y => db[y].months[0].fixed.some(e => e.name === 'Auto rent'), year)).toBe(true);
  await page.locator('#desktopBudgetButton').click();
  await page.locator('#activeYearSelect').selectOption(next);
  await page.evaluate(() => sessionStorage.setItem('__mock_budget_cloud_failure', '1'));
  await queueBrandedResponse(page);
  await page.locator('#desktopCopyPreviousYear').click();
  await expect(page.locator('#cloudSaveStatus')).toContainText('Cloud synchronization is pending');
  expect(await page.evaluate(y => ({
    local: db[y].months[0].variable.map(e => e.name),
    cloud: JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')[y] || null,
    conflict: localStorage.getItem(conflictStorageKey(y))
  }), next)).toEqual({ local: ['Manual groceries'], cloud: null, conflict: '1' });
  await page.reload();
  await expect(page.locator('#activeYearSelect')).toHaveValue(next);
  await expect(page.locator('#cloudSaveStatus')).toContainText('Unsynced local');
  await page.evaluate(() => sessionStorage.removeItem('__mock_budget_cloud_failure'));
  await page.locator('#cloudSaveStatus button').filter({ hasText: 'Keep local changes' }).click();
  await expect.poll(() => page.evaluate(y => db[y].months.flatMap(m => m.fixed)
    .filter(e => e.name === 'Auto rent').length, next)).toBe(12);
  await page.evaluate(y => backfillSavedRecurringYears(currentUser.id, y + '-01-01', y + '-12-31'), next);
  expect(await page.evaluate(y => {
    const row = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))[y];
    return {
      cloudRecurring: row.budget_data.months.flatMap(m => m.fixed).filter(e => e.name === 'Auto rent').length,
      localRecurring: db[y].months.flatMap(m => m.fixed).filter(e => e.name === 'Auto rent').length,
      manual: db[y].months[0].variable.map(e => e.name),
      conflict: localStorage.getItem(conflictStorageKey(y))
    };
  }, next)).toEqual({ cloudRecurring: 12, localRecurring: 12, manual: ['Manual groceries'], conflict: null });
});


test('desktop distinguishes a cloud-saved future year from deferred recurring backfill and resumes after reload', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year) + 1);
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Recoverable recurring');
  await form.locator('[data-rec-field="amount"]').fill('25');
  await form.locator('[data-rec-field="startDate"]').fill(year + '-01-15');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect.poll(() => page.evaluate(y => db[y].months[0].fixed.some(
    entry => entry.name === 'Recoverable recurring'), year)).toBe(true);
  await page.locator('#desktopBudgetButton').click();
  await page.locator('#activeYearSelect').selectOption(next);
  const outcome = await page.evaluate(async y => {
    sessionStorage.setItem('__mock_budget_cloud_update_failure', '1');
    db[y].months[0].variable.push({ name: 'First manual edit', amount: 12 });
    const status = await saveDB();
    return {
      status,
      cloudExists: Boolean(JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')[y]),
      pending: Boolean(localStorage.getItem(recurringSyncPendingKey(currentUser.id))),
      conflict: localStorage.getItem(conflictStorageKey(y))
    };
  }, next);
  expect(outcome).toEqual({
    status: 'cloud-saved-recurring-pending', cloudExists: true, pending: true, conflict: null
  });
  await expect(page.locator('#cloudSaveStatus')).toContainText('Recurring entries are still pending');
  await page.evaluate(() => sessionStorage.removeItem('__mock_budget_cloud_update_failure'));
  await page.reload();
  await expect.poll(() => page.evaluate(y => db[y]?.months.flatMap(month => month.fixed)
    .filter(entry => entry.name === 'Recoverable recurring').length ?? 0, next)).toBe(12);
  expect(await page.evaluate(() => localStorage.getItem(recurringSyncPendingKey(currentUser.id)))).toBe(null);
  await page.reload();
  await expect.poll(() => page.evaluate(y => db[y]?.months.flatMap(month => month.fixed)
    .filter(entry => entry.name === 'Recoverable recurring').length ?? 0, next)).toBe(12);
});

test('desktop due-day selectors save integer days across all expense categories', async ({ page }) => {
  await page.locator('#newFixName').fill('Rent');
  await page.locator('#newFixDue').selectOption('31');
  await page.locator('#newFixAmt').fill('500');
  await page.locator('button[onclick="addExpense(\'fixed\')"]').click();
  await expect(page.locator('#fixedBody select[aria-label="Due day for fixed entry"]')).toHaveValue('31');

  await page.locator('#newVarName').fill('Groceries');
  await page.locator('#newVarDue').selectOption('15');
  await page.locator('#newVarAmt').fill('30');
  await page.locator('button[onclick="addExpense(\'variable\')"]').click();

  await page.locator('#newLoanName').fill('Car');
  await page.locator('#newLoanDue').selectOption('22');
  await page.locator('#newLoanBal').fill('5000');
  await page.locator('#newLoanPay').fill('100');
  await page.locator('button[onclick="addLoan()"]').click();

  await page.locator('#newCcName').fill('Card');
  await page.locator('#newCcDue').selectOption('9');
  await page.locator('#newCcStmt').fill('500');
  await page.locator('#newCcApr').fill('12');
  await page.locator('#newCcPay').fill('50');
  await page.locator('button[onclick="addCC()"]').click();

  await page.locator('#fixedBody select[aria-label="Due day for fixed entry"]').selectOption('1');
  const year = String(new Date().getFullYear());
  const before = await page.evaluate(y => {
    const month = db[y].months[selectedIdx];
    return [month.fixed[0], month.variable[0], month.loans[0], month.creditCards[0]]
      .map(entry => ({ dueDay: entry.dueDay, hasLegacyDue: Object.hasOwn(entry, 'due') }));
  }, year);
  expect(before).toEqual([1, 15, 22, 9].map(dueDay => ({ dueDay, hasLegacyDue: false })));
  await page.reload();
  await expect(page.locator('#fixedBody select[aria-label="Due day for fixed entry"]')).toHaveValue('1');
  expect(await page.evaluate(y => db[y].months[selectedIdx].loans[0].dueDay, year)).toBe(22);
});

test('desktop save migrates known legacy ordinals without altering expense amounts', async ({ page }) => {
  const year = String(new Date().getFullYear());
  await page.evaluate(y => {
    db[y].months[selectedIdx].fixed.push({ name: 'Legacy Rent', due: '1st', amount: 900 });
    db[y].months[selectedIdx].loans.push({ name: 'Legacy Loan', due: '22nd', payment: 200, balance: 500 });
    render();
  }, year);
  await expect(page.locator('#fixedBody select[aria-label="Due day for fixed entry"]')).toHaveValue('1');
  await page.evaluate(() => saveDB());
  const saved = await page.evaluate(y => {
    const month = db[y].months[selectedIdx];
    const cloud = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')[y];
    return {
      local: [month.fixed[0], month.loans[0]],
      cloud: cloud?.budget_data.months[selectedIdx].fixed[0]
    };
  }, year);
  expect(saved.local[0]).toMatchObject({ dueDay: 1, amount: 900 });
  expect(saved.local[1]).toMatchObject({ dueDay: 22, payment: 200, balance: 500 });
  expect(saved.cloud).toMatchObject({ dueDay: 1, amount: 900 });
  expect(saved.local[0].due).toBeUndefined();
  expect(saved.local[1].due).toBeUndefined();
  await page.reload();
  await expect(page.locator('#fixedBody select[aria-label="Due day for fixed entry"]')).toHaveValue('1');
});

test('desktop rejects budget edits while cloud reconciliation is in flight and survives reload', async ({ page }) => {
  await holdCloudReconciliation(page);
  await page.locator('#newVarName').fill('Blocked addition');
  await page.locator('#newVarDue').selectOption('15');
  await page.locator('#newVarAmt').fill('800');
  await page.locator(`button[onclick="addExpense('variable')"]`).click();
  await page.evaluate(async () => {
    await editExp('variable', 0, 'amount', '999');
    await delItem('variable', 0);
    await updateStartLeftover('400');
    await setAutoCascade(false);
  });
  const during = await page.evaluate(() => {
    const year = db[activeYear];
    const cached = JSON.parse(localStorage.getItem(storageKey(activeYear)));
    return {
      rows: year.months[0].variable.map(item => [item.name, item.amount]),
      cachedRows: cached.data.months[0].variable.map(item => [item.name, item.amount]),
      opening: year.months[0].recordedLeftover,
      autoCascade: year.autoCascade,
      locked: reconcilingBudgetYears.has(currentUser.id + ':' + activeYear)
    };
  });
  expect(during).toEqual({
    rows: [['Protected expense', 25]], cachedRows: [['Protected expense', 25]],
    opening: 0, autoCascade: true, locked: true
  });
  await expect(page.locator('#cloudSaveStatus')).toContainText('Reconciliation in progress');
  await finishHeldReconciliation(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem(conflictStorageKey(activeYear)))).toBe(null);
  await page.reload();
  await expectAuthenticatedBudget(page);
  expect(await page.evaluate(() => db[activeYear].months[0].variable.map(item => [item.name, item.amount])))
    .toEqual([['Protected expense', 25]]);
  expect(await page.evaluate(() => db[activeYear].months[0].recordedLeftover)).toBe(0);
});

test('legacy income migration refreshes the source cloud revision for year copy and January projection', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year) + 1);
  await page.evaluate(async y => {
    sessionStorage.setItem('__mock_legacy_accounts', '1');
    db[y].months[0].income.push({ name: 'Legacy January', cpm: 40, usaa: 60 });
    db[y].months[11].income.push({ name: 'Legacy December', cpm: 80, usaa: 120 });
    await saveDB();
  }, year);
  await page.reload();
  await expectAuthenticatedBudget(page);
  // Authentication can complete before account migration; wait for committed converted rows.
  await expect.poll(() => page.evaluate(y =>
    db[y].months[0].income.map(item => [item.accountId, item.amount]), year))
    .toEqual([['cpm', 40], ['usaa', 60]]);
  const migrated = await page.evaluate(y => {
    const row = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))[y];
    return {
      known: cloudBudgetVersions.get(currentUser.id + ':' + y),
      remote: row.updated_at,
      entries: db[y].months[0].income.map(item => [item.accountId, item.amount])
    };
  }, year);
  expect(migrated.known).toBe(migrated.remote);
  expect(migrated.entries).toEqual([['cpm', 40], ['usaa', 60]]);
  await page.locator('#activeYearSelect').selectOption(next);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeVisible();
  await expect(page.locator('#desktopProjectJanuary')).toBeVisible();
  await queueBrandedResponse(page);
  await page.locator('#desktopCopyPreviousYear').click();
  await expect.poll(() => page.evaluate(y => db[y].months[0].income.length, next)).toBe(2);
  await page.locator('#desktopProjectJanuary').click();
  await expect.poll(() => page.evaluate(y => db[y].months[0].recordedLeftover, next)).toBe(300);
  await page.reload();
  await expectAuthenticatedBudget(page);
  expect(await page.evaluate(y => db[y].months[0].income.map(item => item.amount), next)).toEqual([40, 60]);
  expect(await page.evaluate(y => db[y].months[0].recordedLeftover, next)).toBe(300);
});

test('year planning blocks stale remote revisions even after legacy migration', async ({ page }) => {
  const year = String(new Date().getFullYear()), next = String(Number(year) + 1);
  await page.evaluate(async y => {
    sessionStorage.setItem('__mock_legacy_accounts', '1');
    db[y].months[11].income.push({ name: 'Legacy December', cpm: 125, usaa: 0 });
    await saveDB();
  }, year);
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect.poll(() => page.evaluate(y => {
    const row = db[y].months[11].income[0];
    const remote = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}')[y];
    return row?.accountId === 'cpm' && row?.amount === 125 &&
      Boolean(remote && cloudBudgetVersions.get(currentUser.id + ':' + y) === remote.updated_at);
  }, year)).toBe(true);
  await page.evaluate(y => {
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'));
    rows[y].updated_at = '2099-01-01T00:00:00.000Z';
    rows[y].budget_data.months[11].income[0].amount = 999;
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
  }, year);
  await page.locator('#activeYearSelect').selectOption(next);
  await expect(page.locator('#desktopCopyPreviousYear')).toBeVisible();
  await queueBrandedResponse(page);
  await page.locator('#desktopCopyPreviousYear').click();
  await expect(page.locator('#cloudSaveStatus')).toContainText('previous budget year');
  expect(await page.evaluate(y => db[y].months[0].income, next)).toEqual([]);
  await expect(page.locator('#desktopProjectJanuary')).toBeHidden();
});

test('desktop account rename refuses stale other-device changes and reloads authoritative catalog', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('__mock_account_rows', JSON.stringify([{
      user_id: currentUser.id, id: 'checking', name: 'Checking', included: true,
      updated_at: '2026-11-01T00:00:00.000Z'
    }]));
  });
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect.poll(() => page.evaluate(() => budgetAccounts.map(account => account.id))).toEqual(['checking']);
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopAccountsManager .account-manager-row[data-account-id="checking"]')).toContainText('Checking');

  // Simulate another authorized browser committing between our catalog read and edit.
  await page.evaluate(() => {
    const rows = JSON.parse(sessionStorage.getItem('__mock_account_rows'));
    rows[0].name = 'Changed on another device';
    rows[0].updated_at = '2026-11-02T00:00:00.000Z';
    sessionStorage.setItem('__mock_account_rows', JSON.stringify(rows));
  });
  await page.locator('#desktopAccountsManager [data-account-action="rename"][data-account-id="checking"]').click();
  await page.locator('#desktopAccountsManager [data-account-rename-form][data-account-id="checking"] input[name="accountName"]').fill('Unsafe local rename');
  await page.locator('#desktopAccountsManager [data-account-rename-form][data-account-id="checking"] button[type="submit"]').click();
  await expect(page.locator('#desktopAccountsStatus')).toContainText('Account changed on another device');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('__mock_account_rows'))[0].name))
    .toBe('Changed on another device');
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect.poll(() => page.evaluate(() => budgetAccounts.map(account => account.name)))
    .toEqual(['Changed on another device']);
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopAccountsManager .account-manager-row[data-account-id="checking"]')).toContainText('Changed on another device');
});

test('desktop account write never publishes the previous owner catalog after session switch', async ({ page }) => {
  const started = await page.evaluate(async () => {
    const previousOwner = currentUser;
    const originalFrom = supabaseClient.from.bind(supabaseClient);
    window.__originalAccountOwner = previousOwner;
    window.__originalAccountFrom = originalFrom;
    supabaseClient.from = table => {
      const query = originalFrom(table);
      if (table === 'budget_accounts') {
        const originalInsert = query.insert.bind(query);
        query.insert = row => new Promise(resolve => {
          window.__releaseAccountWrite = () => Promise.resolve(originalInsert(row)).then(resolve);
        });
      }
      return query;
    };
    window.__accountWrite = runAccountAction('create', null, 'Original owner checking');
    for (let i = 0; i < 50 && !window.__releaseAccountWrite; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!window.__releaseAccountWrite) throw new Error('Account write not pending');
    currentUser = { id: 'other-owner', email: 'other-owner@example.invalid' };
    return { active: accountsBusy, accounts: budgetAccounts.map(account => account.name) };
  });
  expect(started).toEqual({ active: true, accounts: [] });
  await page.evaluate(async () => {
    window.__releaseAccountWrite();
    await window.__accountWrite;
  });
  const protectedState = await page.evaluate(() => ({
    activeOwner: currentUser.id,
    accounts: budgetAccounts.map(account => account.name),
    message: accountsMessage,
    busy: accountsBusy
  }));
  expect(protectedState).toEqual({ activeOwner: 'other-owner', accounts: [], message: '', busy: false });
  await page.evaluate(() => {
    currentUser = window.__originalAccountOwner;
    supabaseClient.from = window.__originalAccountFrom;
  });
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect.poll(() => page.evaluate(() => budgetAccounts.map(account => account.name)))
    .toEqual(['Original owner checking']);
});


test('desktop account switching waits for the incoming owner catalog before rendering budget', async ({ page }) => {
  await switchWhileAccountCatalogLoads(page);
  await expect(page.locator('#incTotalBadge')).toHaveText('$250.00');
  await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue('SECOND OWNER INCOME');
  await expect(page.locator('#incomeBody')).not.toContainText('FIRST OWNER INCOME');
  expect(await page.evaluate(() => window.__errors)).toEqual([]);
});

test('desktop confirms deletion and blocks accounts referenced by disabled global rules', async ({ page }) => {
  await page.evaluate(() => {
    budgetAccounts = [{ id: 'checking', name: 'Checking', included: true }];
    sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify([{
      user_id: currentUser.id, id: 'disabled-reference', account_id: 'checking',
      active: false, start_date: '2025-01-01'
    }]));
    renderAccounts();
  });
  await page.locator('#desktopSettingsButton').click();
  const accountRow = page.locator('#desktopAccountsManager .account-manager-row[data-account-id="checking"]');
  await expect(accountRow).toContainText('Checking');
  await queueBrandedResponse(page);
  await accountRow.locator('[data-account-action="remove"]').click();
  await expect(page.locator('#desktopAccountsStatus')).toContainText('Reassign or remove global recurring rules');
  await expect(accountRow).toContainText('Checking');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules')).length)).toBe(1);
  await expect(page).toHaveURL(/[?&]page=settings(?:&|$)/);
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect(page.locator('#desktopSettingsButton')).toHaveAttribute('aria-current', 'page');
});


test('desktop account deletion cancellation preserves the account and settings route', async ({ page }) => {
  await page.evaluate(() => {
    budgetAccounts = [{ id: 'cancel-checking', name: 'Cancel Checking', included: true }];
    renderAccounts();
  });
  await page.locator('#desktopSettingsButton').click();
  const row = page.locator('#desktopAccountsManager .account-manager-row[data-account-id="cancel-checking"]');
  await expect(row).toBeVisible();
  await queueBrandedResponse(page, 'cancel');
  await row.locator('[data-account-action="remove"]').click();
  const message = await page.evaluate(() => window.__brandedDialogSeen[0]);
  expect(message).toContain('Remove Cancel Checking?');
  expect(message).toContain('This cannot be undone');
  await expect(row).toContainText('Cancel Checking');
  await expect(page.locator('#desktopAccountsStatus')).not.toContainText('Account changes saved');
  await expect(page).toHaveURL(/[?&]page=settings(?:&|$)/);
  await page.locator('#desktopRecurringButton').click();
  await expect(page.locator('#desktopRecurringButton')).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expectAuthenticatedBudget(page);
  await expect(page.locator('#desktopRecurringButton')).toHaveAttribute('aria-current', 'page');
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopSettingsButton')).toHaveAttribute('aria-current', 'page');
});
