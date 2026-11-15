import { mockSignedInBudget, expectAuthenticatedBudget } from './auth-fixture.js';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

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
  await page.locator('#newFixDue').fill('1st');
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
  await page.locator('#newVarDue').fill('4th');
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

test('older saved years and divergent unsynced custom years are restored without overwriting local data', async ({ page }) => {
  await page.evaluate(() => {
    const original = structuredClone(db[activeYear]);
    const local = structuredClone(original);
    local.months[0].fixed.push({ name: 'LOCAL-2034', amount: 75, due: '1st' });
    const cloud = structuredClone(original);
    cloud.months[0].fixed.push({ name: 'CLOUD-2034', amount: 80, due: '1st' });
    const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}');
    rows['2034'] = { year: 2034, budget_data: cloud, updated_at: '2026-11-15T12:00:00.000Z' };
    rows['2023'] = { year: 2023, budget_data: original, updated_at: '2026-11-15T12:00:00.000Z' };
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
    localStorage.setItem(storageKey('2034'), JSON.stringify({ data: local, updatedAt: '2026-11-15T11:00:00.000Z' }));
  });
  await page.reload();
  await expect(page.locator('#activeYearSelect option[value="2023"]')).toHaveCount(1);
  await expect(page.locator('#activeYearSelect option[value="2034"]')).toContainText('Unsynced');
  await page.locator('#activeYearSelect').selectOption('2034');
  await expect(page.locator('#cloudSaveStatus')).toContainText('Unsynced');
  const result = await page.evaluate(() => ({
    localInMemory: db['2034'].months[0].fixed[0].name,
    localInCache: JSON.parse(localStorage.getItem(storageKey('2034'))).data.months[0].fixed[0].name,
    cloud: JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows'))['2034'].budget_data.months[0].fixed[0].name,
    marker: localStorage.getItem(conflictStorageKey('2034'))
  }));
  expect(result).toEqual({ localInMemory: 'LOCAL-2034', localInCache: 'LOCAL-2034', cloud: 'CLOUD-2034', marker: '1' });
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
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#authBtn').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /Make room for what matters/i })).toBeVisible();
  await expect(page.locator('#incomeBody')).toHaveCount(0);
});

test('cancelling desktop sign-out keeps the authenticated budget visible', async ({ page }) => {
  page.once('dialog', dialog => dialog.dismiss());
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
  expect(await read()).toEqual(entries);
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
  page.once('dialog', dialog => dialog.accept());
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
  page.once('dialog', dialog => dialog.accept());
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
  const answers = ['150', 'monthly'];
  page.on('dialog', dialog => dialog.accept(answers.shift() ?? ''));
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
  expect(await page.evaluate(() => db['2026'].months[11].fixed.filter(
    x => x.name === 'Future price edit').map(x => x.amount))).toEqual([150]);
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
  await page.locator('#desktopRetryRecurringSync').click();
  await expect.poll(() => page.evaluate(() => db['2026'].months[11].fixed
    .filter(x => x.name === 'Retry protected entry').length)).toBe(1);
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
