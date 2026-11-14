import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = 'https://phiscfwfuzeptetimdbo.supabase.co';
const env = name => {
  const value = process.env[name];
  assert(value, 'Missing required environment setting: ' + name);
  return value;
};
const key = env('STAGING_PUBLISHABLE_KEY');
assert(key.startsWith('sb_publishable_'), 'Use the staging publishable key, not an admin key');

const run = randomUUID();
const year = 2199;
const sessions = [];
const created = [];
let failures = 0;

async function request(path, { token, method = 'GET', body } = {}) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (path.startsWith('/rest/')) headers.Prefer = 'return=representation';
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, ok: response.ok, data };
}

function success(result) {
  assert(result.ok, 'Unexpected HTTP status ' + result.status);
}
function denied(result) {
  assert(
    [401, 403].includes(result.status) || (result.ok && Array.isArray(result.data) && result.data.length === 0),
    'Unauthorized operation was not denied'
  );
}
function tablePathAt(targetYear, extra = '') {
  return '/rest/v1/budget_ui_years?select=user_id,year,budget_data,updated_at&year=eq.' + targetYear + extra;
}
function tablePath(extra = '') {
  return tablePathAt(year, extra);
}
async function rows(session) {
  const result = await request(tablePath('&user_id=eq.' + session.user.id), { token: session.access_token });
  success(result);
  assert(Array.isArray(result.data));
  return result.data;
}
async function check(name, action) {
  try {
    await action();
    console.log('PASS ' + name);
  } catch {
    failures++;
    console.error('FAIL ' + name + ' (sensitive response details suppressed)');
  }
}

try {
  for (const account of ['A', 'B']) {
    const result = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: {
        email: env('STAGING_TEST_' + account + '_EMAIL'),
        password: env('STAGING_TEST_' + account + '_PASSWORD')
      }
    });
    success(result);
    assert(result.data?.access_token && result.data?.refresh_token && result.data?.user?.id, 'Invalid sign-in response');
    sessions.push(result.data);
  }

  assert.notEqual(sessions[0].user.id, sessions[1].user.id, 'Two distinct staging test accounts are required');
  for (const session of sessions) {
    const existing = await rows(session);
    assert.equal(existing.length, 0, 'Reserved integration year 2199 must be empty; no existing data will be overwritten');
  }

  for (const [index, session] of sessions.entries()) {
    const budget = { integrationRun: run, owner: index, months: [] };
    const result = await request('/rest/v1/budget_ui_years', {
      token: session.access_token,
      method: 'POST',
      body: { user_id: session.user.id, year, budget_data: budget, updated_at: new Date().toISOString() }
    });
    success(result);
    assert.equal(result.data?.[0]?.user_id, session.user.id);
    assert.equal(result.data?.[0]?.year, year);
    created.push({ session });
  }

  for (const [index, session] of sessions.entries()) {
    const otherSession = sessions[1 - index];

    await check('account ' + index + ' reads only its own year row', async () => {
      const data = await rows(session);
      assert.equal(data.length, 1);
      assert.equal(data[0].user_id, session.user.id);
      assert.equal(data[0].budget_data.integrationRun, run);
    });
    await check('account ' + index + ' updates its own year row', async () => {
      const result = await request(tablePath('&user_id=eq.' + session.user.id), {
        token: session.access_token,
        method: 'PATCH',
        body: { budget_data: { integrationRun: run, owner: index, value: 200 } }
      });
      success(result);
      assert.equal(result.data?.length, 1);
      assert.equal((await rows(session))[0].budget_data.value, 200);
    });
    await check('account ' + index + ' cannot read the other account row', async () => {
      const result = await request(tablePath('&user_id=eq.' + otherSession.user.id), { token: session.access_token });
      success(result);
      assert.deepEqual(result.data, []);
    });
    await check('account ' + index + ' cannot update the other account row', async () => {
      const result = await request(tablePath('&user_id=eq.' + otherSession.user.id), {
        token: session.access_token,
        method: 'PATCH',
        body: { budget_data: { integrationRun: run, unauthorized: true } }
      });
      denied(result);
      assert.equal((await rows(otherSession))[0].budget_data.unauthorized, undefined);
    });
    await check('account ' + index + ' cannot delete the other account row', async () => {
      const result = await request(tablePath('&user_id=eq.' + otherSession.user.id), {
        token: session.access_token,
        method: 'DELETE'
      });
      denied(result);
      assert.equal((await rows(otherSession)).length, 1);
    });
    await check('account ' + index + ' cannot insert as another owner', async () => {
      const attemptedYear = year - 1;
      const result = await request('/rest/v1/budget_ui_years', {
        token: session.access_token,
        method: 'POST',
        body: {
          user_id: otherSession.user.id,
          year: attemptedYear,
          budget_data: { integrationRun: run, unauthorized: true }
        }
      });
      if (result.ok) {
        const cleanup = await request(tablePathAt(attemptedYear, '&user_id=eq.' + otherSession.user.id), {
          token: otherSession.access_token,
          method: 'DELETE'
        });
        success(cleanup);
      }
      assert([401, 403].includes(result.status), 'Cross-owner insert must be rejected by RLS');
    });
    await check('account ' + index + ' cannot change row ownership', async () => {
      const result = await request(tablePath('&user_id=eq.' + session.user.id), {
        token: session.access_token,
        method: 'PATCH',
        body: { user_id: randomUUID() }
      });
      assert([401, 403].includes(result.status), 'Ownership change must be rejected by RLS');
      assert.equal((await rows(session))[0].user_id, session.user.id);
    });
    await check('account ' + index + ' refreshes its real session', async () => {
      const result = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: session.refresh_token }
      });
      success(result);
      assert.equal(result.data?.user?.id, session.user.id);
      Object.assign(session, result.data);
      assert.equal((await rows(session))[0].user_id, session.user.id);
    });
  }

  await check('anonymous reads are denied', async () => {
    const result = await request(tablePath());
    assert([401, 403].includes(result.status));
  });
  await check('anonymous inserts are denied', async () => {
    const result = await request('/rest/v1/budget_ui_years', {
      method: 'POST',
      body: { user_id: randomUUID(), year: year - 2, budget_data: { integrationRun: run } }
    });
    assert([401, 403].includes(result.status));
  });
  for (const method of ['PATCH', 'DELETE']) {
    await check('anonymous ' + method + ' is denied', async () => {
      const result = await request(tablePath('&user_id=eq.' + sessions[0].user.id), {
        method,
        body: method === 'PATCH' ? { budget_data: { integrationRun: run } } : undefined
      });
      assert([401, 403].includes(result.status));
    });
  }
} catch {
  failures++;
  console.error('FAIL setup or fixture creation; sensitive response details suppressed');
} finally {
  for (const { session } of created) {
    await check('cleanup owned synthetic year row', async () => {
      const current = await rows(session);
      const row = current.find(item => item.year === year);
      if (row) {
        assert.equal(row.budget_data?.integrationRun, run, 'Refusing to delete a row not created by this run');
        const result = await request(tablePath('&user_id=eq.' + session.user.id), {
          token: session.access_token,
          method: 'DELETE'
        });
        success(result);
      }
      assert.deepEqual(await rows(session), []);
    });
  }
  for (const session of sessions) {
    await check('sign out test session', async () => {
      const result = await request('/auth/v1/logout?scope=local', { token: session.access_token, method: 'POST' });
      assert([200, 204].includes(result.status) || ([403, 404].includes(result.status) && result.data?.code === 'session_not_found'));
    });
  }
}

process.exitCode = failures ? 1 : 0;
