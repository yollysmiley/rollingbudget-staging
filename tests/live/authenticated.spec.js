import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { requiredSettings, logoutAccepted } from './safety.mjs';

const URL = 'https://phiscfwfuzeptetimdbo.supabase.co';
const YEAR = 2026;
const RUN = randomUUID();
let settings;
let accounts = [];

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
      income: index === 0 ? [{ name: label, cpm: 100, usaa: 0 }] : [],
      fixed: [],
      variable: [],
      creditCards: [],
      loans: []
    }))
  };
}

async function seed(account, label) {
  const result = await api('/rest/v1/budget_ui_years', account, 'POST', {
    user_id: account.user.id,
    year: YEAR,
    budget_data: fixture(label),
    updated_at: new Date().toISOString()
  });
  expect(result[0].user_id).toBe(account.user.id);
  expect(result[0].year).toBe(YEAR);
}

async function guestPage(context) {
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/rollover-budget-app.html');
  await expect.poll(() => page.evaluate(() => typeof supabaseClient !== 'undefined' && Boolean(supabaseClient))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(db['2026']))).toBe(true);
  return page;
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
  if (label) {
    await expect.poll(() => page.evaluate(() => db['2026']?.months?.[0]?.income?.[0]?.name)).toBe(label);
    await expect(page.locator('#incomeBody input:not([type])').first()).toHaveValue(label);
  }
}

async function open(context, account, label) {
  const page = await guestPage(context);
  await switchTo(page, account, label);
  return page;
}

async function cleanup(account) {
  const existing = await rows(account);
  if (existing.length) {
    const row = existing[0];
    if (row.budget_data?.integrationRun !== RUN) {
      throw new Error('Refusing to clean a staging budget row not created by this test run');
    }
    await api('/rest/v1/budget_ui_years?user_id=eq.' + account.user.id + '&year=eq.' + YEAR, account, 'DELETE');
  }
  expect(await rows(account)).toHaveLength(0);
}

test.beforeEach(async () => {
  accounts = [];
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
  let failed = false;
  for (const account of accounts) {
    try { await cleanup(account); } catch { failed = true; }
    try {
      const result = await request('/auth/v1/logout?scope=local', account, 'POST');
      if (!logoutAccepted(result.status, result.data)) failed = true;
    } catch { failed = true; }
  }
  if (failed) throw new Error('Staging cleanup failed; inspect only the dedicated test-year fixtures before rerunning');
});

test('authenticated cloud save survives a fresh browser context', async ({ browser, context }) => {
  const account = accounts[0];
  await seed(account, 'CLOUD-SEED');
  const page = await open(context, account, 'CLOUD-SEED');

  const name = page.locator('#incomeBody input:not([type])').first();
  await name.fill('UI-SAVED');
  await name.press('Tab');
  const amount = page.locator('#incomeBody input[type="number"]').first();
  await amount.fill('4321.25');
  await amount.press('Tab');

  await expect.poll(async () => (await rows(account))[0]?.budget_data?.months?.[0]?.income?.[0]?.name).toBe('UI-SAVED');
  await expect.poll(async () => (await rows(account))[0]?.budget_data?.months?.[0]?.income?.[0]?.cpm).toBe(4321.25);

  const fresh = await browser.newContext({ locale: 'en-US', trace: 'off' });
  try {
    const restored = await open(fresh, account, 'UI-SAVED');
    await expect(restored.locator('#incomeBody input[type="number"]').first()).toHaveValue('4321.25');
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

  await page.locator('#authBtn').click();
  await expect.poll(() => page.evaluate(() => currentUser === null)).toBe(true);
  await expect(page.locator('#authBtn')).toHaveText('Sign In');
  await expect(page.locator('#incomeBody input')).toHaveCount(0);

  await switchTo(page, b, 'LOGOUT-B');
  await expect(page.locator('#incomeBody')).not.toContainText('LOGOUT-A');
});
