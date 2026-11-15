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

test('desktop Settings exposes year, automation and recurring controls on separate screens', async ({ page }) => {
  await expect(page.locator('#desktopSettingsButton')).toBeVisible();
  await expect(page.locator('#desktopSettingsPanel')).toBeHidden();
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopSettingsButton')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#desktopSettingsPanel')).toBeVisible();
  await expect(page.locator('.main-grid')).toBeHidden();
  await expect(page.locator('#settingsAccounts')).toBeVisible();
  await expect(page.locator('#settingsYears')).toBeHidden();
  await page.locator('[data-settings-section="years"]').click();
  await expect(page.locator('#activeYearSelect')).toBeVisible();
  await expect(page.locator('#desktopSettingsPanel button[onclick="createNewYear()"]')).toBeVisible();
  await page.locator('#activeYearSelect').selectOption('2027');
  await expect(page.locator('#activeYearSelect')).toHaveValue('2027');
  await page.locator('[data-settings-section="automation"]').click();
  await expect(page.locator('#autoRollToggle')).toBeVisible();
  await expect(page.locator('#desktopSettingsPanel button[onclick="openRecurringModal()"]')).toHaveCount(0);
  await expect(page.locator('#desktopRecurringButton')).toBeVisible();
  await expect(page.locator('#activeYearSelect')).toBeHidden();
  await page.locator('#desktopBudgetButton').click();
  await expect(page.locator('#desktopSettingsPanel')).toBeHidden();
  await expect(page.locator('.main-grid')).toBeVisible();
  await expect(page.locator('#desktopSettingsButton')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#desktopSettingsButton').click();
  await page.locator('[data-settings-section="years"]').click();
  await expect(page.locator('#activeYearSelect')).toHaveValue('2027');
});

test('desktop shared recurring rules require explicit apply and disabling preserves saved entries', async ({ page }) => {
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#desktopSettingsPanel')).toBeVisible();
  await page.locator('#desktopRecurringButton').click();
  const form = page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Quarterly Internet');
  await form.locator('[data-rec-field="amount"]').fill('80');
  await form.locator('[data-rec-field="due"]').fill('10th');
  await form.locator('[data-rec-field="frequency"]').selectOption('quarterly');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  await expect(page.locator('#desktopRulesList')).toContainText('Quarterly Internet');
  await expect(page.locator('#desktopRulesList')).toContainText('Quarterly');
  const before = await page.evaluate(() => db[activeYear].months.map(m => m.fixed.filter(x => x.name === 'Quarterly Internet').length));
  expect(before).toEqual(Array(12).fill(0));
  await expect(page.locator('#desktopApplyRecurringPreview')).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#desktopApplyRecurringPreview').click();
  await expect.poll(() => page.evaluate(() => db[activeYear].months.map(m => m.fixed.filter(x => x.name === 'Quarterly Internet').length)))
    .toEqual([1,0,0,1,0,0,1,0,0,1,0,0]);
  await page.locator('#desktopRulesList button').filter({ hasText: 'Disable' }).click();
  await expect(page.locator('#desktopRulesList')).toContainText('Disabled');
  const after = await page.evaluate(() => db[activeYear].months.map(m => m.fixed.filter(x => x.name === 'Quarterly Internet').length));
  expect(after).toEqual([1,0,0,1,0,0,1,0,0,1,0,0]);
  const edits = ['90', 'monthly'];
  page.on('dialog', dialog => dialog.accept(edits.shift()));
  await page.locator('#desktopRulesList button').filter({ hasText: 'Edit' }).click();
  await expect.poll(() => page.evaluate(() => {
    const rules = JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]');
    return rules[0]?.versions?.at(-1)?.amount;
  })).toBe(90);
  const unchanged = await page.evaluate(() => db[activeYear].months.map(m => m.fixed.filter(x => x.name === 'Quarterly Internet').length));
  expect(unchanged).toEqual(after);
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

test('year switching in mobile Settings and narrow viewport remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  // On mobile, year controls live in the slide-out Settings panel rather than the header.
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('#mobileSidebar')).toHaveClass(/open/);
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('#mobileSettingsPanel')).toBeVisible();
  await page.locator('#mobileSettingsMenu button').filter({ hasText: 'Budget Years' }).click();
  await expect(page.locator('#mobileActiveYearSelect')).toBeVisible();

  await page.locator('#mobileActiveYearSelect').selectOption('2027');
  await expect(page.locator('#mobileActiveYearSelect')).toHaveValue('2027');
  const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(size.content).toBeLessThanOrEqual(size.width + 1);
});

test('timestamp comparison selects the newest budget copy', async ({ page }) => {
  const result = await page.evaluate(() => {
    const local = { data: { id: 'local' }, updatedAt: Date.parse('2026-11-13T10:00:00Z') };
    const newerCloud = { data: { id: 'cloud' }, updatedAt: Date.parse('2026-11-13T11:00:00Z') };
    const newerLocal = { data: { id: 'local-new' }, updatedAt: Date.parse('2026-11-13T12:00:00Z') };
    const unversionedLocal = { data: { id: 'legacy-local' }, updatedAt: null, legacy: true };
    return {
      cloudWins: chooseNewestBudget(local, newerCloud).data.id,
      localWins: chooseNewestBudget(newerLocal, newerCloud).data.id,
      legacyYields: chooseNewestBudget(unversionedLocal, newerCloud).data.id,
      localOnly: chooseNewestBudget(local, null).data.id,
      cloudOnly: chooseNewestBudget(null, newerCloud).data.id
    };
  });
  expect(result).toEqual({
    cloudWins: 'cloud',
    localWins: 'local-new',
    legacyYields: 'cloud',
    localOnly: 'local',
    cloudOnly: 'cloud'
  });
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

test('desktop primary navigation follows the reference hierarchy without losing budget state', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(nav.locator('button')).toHaveText(['Overview', 'Budget', 'Recurring Rules', 'Settings']);
  await page.locator('#desktopSettingsButton').click();
  await expect(page.locator('#settingsAccounts')).toBeVisible();
  await expect(page.locator('#settingsYears')).toBeHidden();
  await expect(page.locator('#settingsAutomation')).toBeHidden();
  await expect(page.locator('#settingsProfile')).toBeHidden();
  await page.locator('[data-settings-section="years"]').click();
  await page.locator('#activeYearSelect').selectOption('2027');
  await page.locator('#desktopRecurringButton').click();
  await expect(page.locator('#recurringManagerPage')).toBeVisible();
  await page.locator('#desktopBudgetButton').click();
  await expect(page.locator('#recurringManagerPage')).toBeHidden();
  await expect(page.locator('#rollingStrip')).toBeVisible();
  await page.locator('#desktopSettingsButton').click();
  await page.locator('[data-settings-section="years"]').click();
  await expect(page.locator('#activeYearSelect')).toHaveValue('2027');
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

test('desktop duplicate review skips ambiguous historical entries when user declines', async ({ page }) => {
  await page.evaluate(async () => {
    db[activeYear].months[0].variable.push({ name: 'Rent payment', amount: 500, accountId: null });
    sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify([{
      id: 'rent-review', name: 'Rent', category: 'fixed', amount: 500,
      due: '1st', account_id: null, frequency: 'monthly',
      start_date: '2026-01-01', end_date: null, active: true, source_year: null,
      versions: [{ effectiveFrom: '2026-01-01', name: 'Rent', amount: 500,
        due: '1st', accountId: null, frequency: 'monthly' }]
    }]));
    await saveDB();
  });
  await page.reload();
  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    if (dialog.message().includes('Possible duplicate for')) await dialog.dismiss();
    else await dialog.accept();
  });
  await page.locator('#desktopSettingsButton').click();
  await page.locator('#desktopRecurringButton').click();
  await expect(page.locator('#desktopApplyRecurringPreview')).toBeEnabled();
  await page.locator('#desktopApplyRecurringPreview').click();
  await expect.poll(() => dialogs.some(message => message.includes('Possible duplicate for'))).toBeTruthy();
  await expect.poll(() => page.evaluate(() => db[activeYear].months[0].fixed.some(x => x.name === 'Rent'))).toBeFalsy();
  const entries = await page.evaluate(() => db[activeYear].months[0].variable.filter(x => x.name === 'Rent payment'));
  expect(entries).toHaveLength(1);
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
