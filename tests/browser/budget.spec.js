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

test('recurring manager applies quarterly rules and disabling removes generated items', async ({ page }) => {
  await page.locator('button[onclick="openRecurringModal()"]').click();
  await expect(page.locator('#recurringManagerPage')).toBeVisible();
  await expect(page.locator('#recurringDesktopView')).toBeVisible();
  const form=page.locator('[data-recurring-form="desktop"]');
  await form.locator('[data-rec-field="name"]').fill('Quarterly Internet');
  await form.locator('[data-rec-field="amount"]').fill('80');
  await form.locator('[data-rec-field="due"]').fill('10th');
  await form.locator('[data-rec-field="frequency"]').selectOption('quarterly');
  await page.locator('button[onclick="addRecurringRule(\\'desktop\\')"]').click();
  await expect(page.locator('#desktopRulesList')).toContainText('Quarterly Internet');
  await expect(page.locator('#desktopRulesList')).toContainText('Quarterly');
  const occurrences=await page.evaluate(()=>db[activeYear].months.map(m=>m.fixed.filter(x=>x.name==='Quarterly Internet').length));
  expect(occurrences).toEqual([1,0,0,1,0,0,1,0,0,1,0,0]);
  await page.locator('#desktopRulesList button').filter({hasText:'Disable'}).click();
  await expect(page.locator('#desktopRulesList')).toContainText('Disabled');
  const disabled=await page.evaluate(()=>db[activeYear].months.map(m=>m.fixed.filter(x=>x.name==='Quarterly Internet').length));
  expect(disabled).toEqual(Array(12).fill(0));
});

test('legacy recurring rules remain visible and disabling preserves existing budget entries', async ({ page }) => {
  await page.evaluate(async()=>{db[activeYear].recurringRules=[{id:123,cat:'fixed',name:'Legacy Rent',amount:900,due:'1st',start:0,end:11}];db[activeYear].months[0].fixed.push({name:'Legacy Rent',due:'1st',amount:900});await saveDB();});
  await page.locator('button[onclick="openRecurringModal()"]').click();
  await expect(page.locator('#desktopRulesList')).toContainText('Legacy Rent');
  await expect(page.locator('#desktopRulesList')).toContainText('Monthly (legacy)');
  await page.locator('#desktopRulesList button').filter({hasText:'Disable'}).click();
  await expect(page.locator('#desktopRulesList')).toContainText('Disabled');
  await expect(page.locator('#fixedBody')).toContainText('Legacy Rent');
});

test('year switching in mobile Settings and narrow viewport remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  // On mobile, year controls live in the slide-out Settings panel rather than the header.
  await page.locator('#mobileMenuButton').click();
  await expect(page.locator('#mobileSidebar')).toHaveClass(/open/);
  await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
  await expect(page.locator('#mobileSettingsPanel')).toBeVisible();
  await expect(page.locator('#activeYearSelect')).toBeVisible();

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
