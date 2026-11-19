import { test, expect, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { requiredSettings, logoutAccepted, verifiedCleanupSession, shouldLogoutOriginalSession, assertOwnedAccountFixture } from './safety.mjs';

const URL = 'https://phiscfwfuzeptetimdbo.supabase.co';
const YEAR = 2026;
const RUN = randomUUID();
const FIXTURE_ACCOUNT_ID = 'integration-' + RUN;
let settings;
let accounts = [];
let uiLoggedOutOwners;

async function request(path, session, method = 'GET', body) {
  const response = await fetch(URL + path, {
    method,
    headers: {
      apikey: settings.STAGING_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { ok: response.ok, status: response.status, data };
}

async function api(path, session, method = 'GET', body) {
  const result = await request(path, session, method, body);
  if (!result.ok) throw new Error('Staging API request failed with status ' + result.status);
  return result.data;
}

function yearPath(userId) {
  return '/rest/v1/budget_ui_years?select=user_id,year,budget_data,updated_at&user_id=eq.' +
    encodeURIComponent(userId) + '&year=eq.' + YEAR;
}

async function rows(account) {
  return api(yearPath(account.user.id), account);
}

function fixture(label) {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return {
    autoCascade: true,
    recurringRules: [],
    integrationRun: RUN,
    months: names.map((name, index) => ({
      code: name.slice(0, 3).toUpperCase(),
      name,
      recordedLeftover: 0,
      income: index === 0 ? [{ name: label, amount: 100, accountId: FIXTURE_ACCOUNT_ID }] : [],
      fixed: [],
      variable: [],
      creditCards: [],
      loans: []
    }))
  };
}

async function seed(account, label) {
  const inserted = await api('/rest/v1/budget_accounts', account, 'POST', {
    id: FIXTURE_ACCOUNT_ID, user_id: account.user.id, name: 'Integration account ' + RUN, included: true
  });
  expect(inserted[0].id).toBe(FIXTURE_ACCOUNT_ID);
  const result = await api('/rest/v1/budget_ui_years', account, 'POST', {
    user_id: account.user.id,
    year: YEAR,
    budget_data: fixture(label),
    updated_at: new Date().toISOString()
  });
  expect(result[0].user_id).toBe(account.user.id);
  expect(result[0].year).toBe(YEAR);
}

const AUTH_STORAGE_KEY = 'rollingbudget_staging_phiscfwfuzeptetimdbo_auth';

async function establishSession(page, account) {
  // Seed the same per-origin storage used by Supabase before the protected app initializes.
  await page.goto('/');
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, { key: AUTH_STORAGE_KEY, session: account });
  await page.goto('/app/');
  await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
  await expect.poll(() => page.evaluate(id => currentUser?.id === id, account.user.id)).toBe(true);
}

async function switchTo(page, account, label) {
  const result = await page.evaluate(async session => {
    const { error } = await supabaseClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
    return error ? error.message : null;
  }, { access_token: account.access_token, refresh_token: account.refresh_token });
  expect(result).toBeNull();
  await expect.poll(() => page.evaluate(id => currentUser?.id === id, account.user.id)).toBe(true);
  // The year may arrive before its owner-scoped catalog. Do not interact before both are ready.
  await expect.poll(() => page.evaluate(id => accountReadyOwner === id, account.user.id)).toBe(true);
  await expect.poll(() => page.evaluate(id => budgetAccounts.some(account => account.id === id), FIXTURE_ACCOUNT_ID)).toBe(true);
  await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
  if (label) {
    await expect.poll(() => page.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.name)).toBe(label);
    await page.evaluate(() => selectMonth(0));
    await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue(label);
  }
}

async function open(context, account, label) {
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  await establishSession(page, account);
  if (label) {
    await expect.poll(() => page.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.name)).toBe(label);
    await page.evaluate(() => selectMonth(0));
    await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue(label);
  }
  return page;
}

async function cleanup(account, letter) {
  // UI logout revokes the original access token; obtain a new owner-verified session for fixture cleanup.
  const owner = await verifiedCleanupSession(account, async () => {
    const response = await fetch(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: settings.STAGING_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: settings['STAGING_TEST_' + letter + '_EMAIL'],
        password: settings['STAGING_TEST_' + letter + '_PASSWORD']
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Fixture cleanup sign-in failed (HTTP ' + response.status + ')');
    return response.json();
  });
  try {
  const accountPath = '/rest/v1/budget_accounts?select=id,user_id,name&user_id=eq.' + encodeURIComponent(owner.user.id) + '&id=eq.' + encodeURIComponent(FIXTURE_ACCOUNT_ID);
  const ownedAccounts = await api(accountPath, owner);
  if (ownedAccounts.length > 1) throw new Error('Unexpected duplicate integration accounts; refusing cleanup');
  if (ownedAccounts.length) assertOwnedAccountFixture(ownedAccounts[0], FIXTURE_ACCOUNT_ID, owner.user.id, RUN);
  const existing = await rows(owner);
  if (existing.length) {
    const row = existing[0];
    if (row.budget_data?.integrationRun !== RUN) {
      throw new Error('Refusing to clean a staging budget row not created by this test run');
    }
    await api('/rest/v1/budget_ui_years?user_id=eq.' + account.user.id + '&year=eq.' + YEAR, owner, 'DELETE');
  }
  expect(await rows(owner)).toHaveLength(0);
  // Delete only the verified run-owned account, after its budget references are gone.
  if (ownedAccounts.length) {
    const deleted = await api(accountPath, owner, 'DELETE');
    expect(deleted).toHaveLength(1);
    assertOwnedAccountFixture(deleted[0], FIXTURE_ACCOUNT_ID, owner.user.id, RUN);
  }
  expect(await api(accountPath, owner)).toHaveLength(0);
  } finally {
    const result = await request('/auth/v1/logout?scope=local', owner, 'POST');
    if (!logoutAccepted(result.status, result.data)) throw new Error('Cleanup session logout failed');
  }
}

test.beforeEach(async () => {
  accounts = [];
  uiLoggedOutOwners = new Set();
  settings = requiredSettings(process.env);
  for (const letter of ['A', 'B']) {
    const result = await fetch(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: settings.STAGING_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: settings['STAGING_TEST_' + letter + '_EMAIL'],
        password: settings['STAGING_TEST_' + letter + '_PASSWORD']
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!result.ok) throw new Error('Staging test account sign-in failed');
    const session = await result.json();
    if (!session.user?.id || !session.access_token || !session.refresh_token) {
      throw new Error('Invalid staging test session');
    }
    accounts.push(session);
  }
  expect(accounts[0].user.id).not.toBe(accounts[1].user.id);
  for (const account of accounts) {
    expect(await rows(account), 'Dedicated test year must be empty; no existing budget will be overwritten').toHaveLength(0);
  }
});

test.afterEach(async () => {
  const failures = [];
  for (const [index, account] of accounts.entries()) {
    try { await cleanup(account, index === 0 ? 'A' : 'B'); }
    catch { failures.push('fixture cleanup for account ' + index); }
    if (shouldLogoutOriginalSession(uiLoggedOutOwners, account.user.id)) {
      try {
        const result = await request('/auth/v1/logout?scope=local', account, 'POST');
        if (!logoutAccepted(result.status, result.data)) failures.push('original session logout for account ' + index + ' (HTTP ' + result.status + ')');
      } catch { failures.push('original session logout for account ' + index); }
    }
  }
  if (failures.length) throw new Error('Staging cleanup failed at: ' + failures.join('; '));
});

test('authenticated cloud save survives a fresh browser context', async ({ browser, context }) => {
  const account = accounts[0];
  await seed(account, 'CLOUD-SEED');
  const page = await open(context, account, 'CLOUD-SEED');

  const name = page.locator('#incomeBody input:not([type])').first();
  await name.fill('UI-SAVED');
  await name.press('Tab');
  const amount = page.locator('#incomeBody tr:not(.roll-row) input[aria-label="Income amount"]');
  await expect(amount).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.accountId)).toBe(FIXTURE_ACCOUNT_ID);
  await amount.fill('4321.25');
  await amount.press('Tab');
  await expect.poll(() => page.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.amount)).toBe(4321.25);

  await expect.poll(async () => (await rows(account))[0]?.budget_data?.months?.[0]?.income?.[0]?.name).toBe('UI-SAVED');
  await expect.poll(async () => (await rows(account))[0]?.budget_data?.months?.[0]?.income?.[0]?.amount).toBe(4321.25);
  await expect.poll(async () => (await rows(account))[0]?.budget_data?.months?.[0]?.income?.[0]?.accountId).toBe(FIXTURE_ACCOUNT_ID);

  const fresh = await browser.newContext({ locale: 'en-US', trace: 'off' });
  try {
    const restored = await open(fresh, account, 'UI-SAVED');
    await expect(restored.locator('#incomeBody tr:not(.roll-row) input[aria-label="Income amount"]')).toHaveValue('4321.25');
    await expect.poll(() => restored.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.accountId)).toBe(FIXTURE_ACCOUNT_ID);
    await expect.poll(() => restored.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.amount)).toBe(4321.25);
    await expect(restored.locator('#incTotalBadge')).toHaveText('$4,321.25');
  } finally {
    await fresh.close();
  }
});

test('account switching loads only the selected account budget', async ({ context }) => {
  const [a, b] = accounts;
  await seed(a, 'ACCOUNT-A');
  await seed(b, 'ACCOUNT-B');
  const page = await open(context, a, 'ACCOUNT-A');

  await switchTo(page, b, 'ACCOUNT-B');
  await expect(page.locator('#incomeBody')).not.toContainText('ACCOUNT-A');

  await switchTo(page, a, 'ACCOUNT-A');
  await expect(page.locator('#incomeBody')).not.toContainText('ACCOUNT-B');
});

test('UI logout clears the signed-in budget before another account is loaded', async ({ context }) => {
  const [a, b] = accounts;
  await seed(a, 'LOGOUT-A');
  await seed(b, 'LOGOUT-B');
  const page = await open(context, a, 'LOGOUT-A');

  // The app uses a branded HTML confirmation dialog, not window.confirm().
  // First verify cancelling leaves the authenticated budget intact.
  await page.locator('#authBtn').click();
  await expect(page.locator('#rbDialogBackdrop')).toBeVisible();
  await expect(page.locator('#rbDialogMessage')).toHaveText('Sign out of your account?');
  await page.locator('#rbDialogCancel').click();
  await expect(page.locator('#rbDialogBackdrop')).toBeHidden();
  await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
  await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue('LOGOUT-A');

  // Confirm the custom dialog before expecting a redirect.
  await page.locator('#authBtn').click();
  await expect(page.locator('#rbDialogBackdrop')).toBeVisible();
  await page.locator('#rbDialogAccept').click();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator('#publicHeadline')).toContainText('Make room for what matters');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
  await expect(page.locator('#incomeBody')).toHaveCount(0);
  uiLoggedOutOwners.add(a.user.id);

  // A signed-out visitor cannot reopen the protected budget.
  await page.goto('/app/');
  await expect(page.locator('#publicHeadline')).toContainText('Make room for what matters');
  await expect(page.locator('#incomeBody')).toHaveCount(0);

  // Authenticate as the other account in the same browser without carrying A's budget.
  await establishSession(page, b);
  await expect.poll(() => page.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.name)).toBe('LOGOUT-B');
  await page.evaluate(() => selectMonth(0));
  await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue('LOGOUT-B');
  await expect(page.locator('#incomeBody')).not.toContainText('LOGOUT-A');
});

test('authenticated mobile navigation and owner isolation survive reload', async ({ browser }) => {
  const [a, b] = accounts;
  await seed(a, 'MOBILE-A');
  await seed(b, 'MOBILE-B');
  const mobile = await browser.newContext({ ...devices['iPhone 13'], browserName: 'chromium', trace: 'off', screenshot: 'off', video: 'off' });
  try {
    const page = await open(mobile, a, 'MOBILE-A');
    await expect(page.locator('#mobileMenuButton')).toBeVisible();
    await page.locator('#mobileMenuButton').click();
    await page.locator('.mobile-sidebar-nav button[data-mobile-tab="settings"]').click();
    await expect(page.locator('#mobileSettingsPanel')).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
    await expect.poll(() => page.evaluate(() => currentUser?.id)).toBe(a.user.id);
    await switchTo(page, b, 'MOBILE-B');
    await expect.poll(() => page.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.name)).toBe('MOBILE-B');
    await expect(page.locator('#mobileAuthBtn')).toBeVisible();
    await page.locator('#mobileAuthBtn').click();
    await expect(page.locator('#rbDialogInputLabel')).toBeHidden();
    await expect(page.locator('#rbDialogBackdrop')).toBeVisible();
    await page.locator('#rbDialogCancel').click();
    await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
  } finally {
    await mobile.close();
  }
});
