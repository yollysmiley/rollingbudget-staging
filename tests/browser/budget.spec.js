import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
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
  await page.goto('/rollover-budget-app.html');
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
  await page.locator('#newIncCpm').fill('3000');
  await page.locator('#newIncUsaa').fill('0');
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
  await page.locator('#newIncCpm').fill('2713.45');
  await page.locator('button[onclick="addIncome()"]').click();
  await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue('SAVE-RELOAD-TEST');
  await page.reload();
  await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue('SAVE-RELOAD-TEST');
  await expect(page.locator('#incomeBody tr:not(.roll-row) input[type="number"]').first()).toHaveValue('2713.45');
  await expect(page.locator('#incTotalBadge')).toHaveText('$2,713.45');
});

test('guest storage is namespaced and existing browser keys are not cleared', async ({ page }) => {
  await page.locator('#newIncName').fill('Stored');
  await page.locator('#newIncCpm').fill('10');
  await page.locator('button[onclick="addIncome()"]').click();
  const result = await page.evaluate(() => ({
    keys: Object.keys(localStorage),
    prefix: 'rollingbudget_staging_phiscfwfuzeptetimdbo_guest_budget_'
  }));
  expect(result.keys.some(key => key.startsWith(result.prefix))).toBe(true);
  expect(result.keys.some(key => key.startsWith('budget_cloud_'))).toBe(false);
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

test('recurring rule applies to the selected months', async ({ page }) => {
  await page.locator('button[onclick="openRecurringModal()"]').click();
  await page.locator('#recName').fill('Internet');
  await page.locator('#recAmount').fill('80');
  await page.locator('#recDue').fill('10th');
  await page.locator('#recStart').selectOption('0');
  await page.locator('#recEnd').selectOption('1');
  await page.locator('button[onclick="applyRecurringRule()"]').click();
  await expect(page.locator('#rulesListContainer')).toContainText('Internet');
  await expect(page.locator('#fixedBody input:not([type])').first()).toHaveValue('Internet');
  await page.locator('#activeYearSelect').selectOption('2027');
  await expect(page.locator('#fixedBody input:not([type])')).toHaveCount(0);
});

test('year switching and narrow viewport remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#activeYearSelect').selectOption('2027');
  await expect(page.locator('#activeYearSelect')).toHaveValue('2027');
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
