import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://**/rest/v1/**', route => route.abort());
  await page.route('https://**/auth/v1/**', route => route.abort());
  await page.addInitScript(() => {
    window.__errors = [];
    window.addEventListener('error', event => window.__errors.push(event.message));
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('rollingbudget_staging_phiscfwfuzeptetimdbo_')) localStorage.removeItem(key);
    }
  });
  await page.goto('/rollover-budget-app.html');
  await expect(page).toHaveTitle(/STAGING/);
  await expect(page.locator('body')).toContainText('STAGING ONLY');
  await expect(page.locator('#incomeBody')).toBeVisible();
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
  await expect(page.locator('#incomeBody')).toContainText('SAVE-RELOAD-TEST');
  await page.reload();
  await expect(page.locator('#incomeBody input[type="text"]').first()).toHaveValue('SAVE-RELOAD-TEST');
  await expect(page.locator('#incomeBody input[type="number"]').first()).toHaveValue('2713.45');
  await expect(page.locator('#incTotalBadge')).toHaveText('$2,713.45');
});

test('guest storage is namespaced and existing browser keys are not cleared', async ({ page }) => {
  await page.locator('#newIncName').fill('Stored');
  await page.locator('#newIncCpm').fill('10');
  await page.locator('button[onclick="addIncome()"]).click();
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
  await page.locator('button[onclick="addExpense(\'variable\')"]').click();
  await expect(page.locator('#variableBody input[type="text"]').first()).toHaveValue(payload);
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
  await expect(page.locator('#fixedBody')).toContainText('Internet');
  await page.locator('#activeYearSelect').selectOption('2027');
  await expect(page.locator('#fixedBody')).not.toContainText('Internet');
});

test('year switching and narrow viewport remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#activeYearSelect').selectOption('2027');
  await expect(page.locator('#activeYearSelect')).toHaveValue('2027');
  const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(size.content).toBeLessThanOrEqual(size.width + 1);
});
