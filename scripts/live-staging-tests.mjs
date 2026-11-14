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
const year = '2199';
const sessions = [];
const created = [];
let failures = 0;
let setupStep = 'initialization';

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

function success(result, operation) {
  assert(result.ok, operation + ' failed (HTTP ' + result.status +
    (result.data?.code ? ', code ' + result.data.code : '') + ')');
}
function denied(result) {
  assert(
    [401, 403].includes(result.status) || (result.ok && Array.isArray(result.data) && result.data.length === 0),
    'Unauthorized operation was not denied'
  );
}
function tablePath(extra = '') {
  return '/rest/v1/budget_data?select=id,user_id,state,updated_at' + extra;
}
async function rows(session) {
  const result = await request(tablePath('&user_id=eq.' + encodeURIComponent(session.user.id)), {
    token: session.access_token
  });
  success(result, 'Read current budget_data document');
  assert(Array.isArray(result.data), 'Expected a budget_data row array');
  return result.data;
}
function fixture(owner) {
  return {
    integrationRun: run,
    owner,
    autoCascade: true,
    recurringRules: [],
    months: Array.from({ length: 12 }, (_, index) => ({
      code: String(index + 1).padStart(2, '0'),
      name: 'Month ' + (index + 1),
      recordedLeftover: 0,
      income: [],
      fixed: [],
      variable: [],
      creditCards: [],
      loans: []
    }))
  };
}
async function check(name, action) {
  try {
    await action();
    console.log('PASS ' + name);
  } catch (error) {
    failures++;
    console.error('FAIL ' + name + (error?.message ? ': ' + error.message : ''));
  }
}

try {
  for (const account of ['A', 'B']) {
    setupStep = 'sign in test account ' + account;
    const result = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: {
        email: env('STAGING_TEST_' + account + '_EMAIL'),
        password: env('STAGING_TEST_' + account + '_PASSWORD')
      }
    });
    success(result, 'Sign in test account ' + account);
    assert(result.data?.access_token && result.data?.refresh_token && result.data?.user?.id,
      'Test account ' + account + ' returned an incomplete session');
    sessions.push(result.data);
  }

  setupStep = 'validate distinct test identities';
  assert.notEqual(sessions[0].user.id, sessions[1].user.id,
    'Two distinct staging test accounts are required');

  for (const [index, session] of sessions.entries()) {
    setupStep = 'verify clean budget_data fixture for account ' + index;
    const existing = await rows(session);
    assert.equal(existing.length, 0,
      'Dedicated staging integration account already has a budget_data document; refusing to overwrite it');
  }

  for (const [index, session] of sessions.entries()) {
    setupStep = 'create synthetic budget_data fixture for account ' + index;
    const state = { [year]: fixture(index) };
    const result = await request('/rest/v1/budget_data', {
      token: session.access_token,
      method: 'POST',
      body: { user_id: session.user.id, state, updated_at: new Date().toISOString() }
    });
    success(result, 'Create budget_data fixture for account ' + index);
    assert.equal(result.data?.[0]?.user_id, session.user.id);
    assert.equal(result.data?.[0]?.state?.[year]?.integrationRun, run);
    created.push({ session });
  }

  for (const [index, session] of sessions.entries()) {
    const otherSession = sessions[1 - index];
    const ownPath = tablePath('&user_id=eq.' + encodeURIComponent(session.user.id));
    const otherPath = tablePath('&user_id=eq.' + encodeURIComponent(otherSession.user.id));

    await check('account ' + index + ' reads only its own budget document', async () => {
      const data = await rows(session);
      assert.equal(data.length, 1);
      assert.equal(data[0].user_id, session.user.id);
      assert.equal(data[0].state?.[year]?.integrationRun, run);
    });
    await check('account ' + index + ' updates its own budget document', async () => {
      const updated = { ...fixture(index), value: 200 };
      const result = await request(ownPath, {
        token: session.access_token,
        method: 'PATCH',
        body: { state: { [year]: updated } }
      });
      success(result, 'Update own budget document');
      assert.equal(result.data?.length, 1);
      assert.equal((await rows(session))[0].state?.[year]?.value, 200);
    });
    await check('account ' + index + ' cannot read the other account document', async () => {
      const result = await request(otherPath, { token: session.access_token });
      success(result, 'Attempt cross-account read');
      assert.deepEqual(result.data, []);
    });
    await check('account ' + index + ' cannot update the other account document', async () => {
      const result = await request(otherPath, {
        token: session.access_token,
        method: 'PATCH',
        body: { state: { [year]: { integrationRun: run, unauthorized: true } } }
      });
      denied(result);
      assert.equal((await rows(otherSession))[0].state?.[year]?.unauthorized, undefined);
    });
    await check('account ' + index + ' cannot delete the other account document', async () => {
      const result = await request(otherPath, { token: session.access_token, method: 'DELETE' });
      denied(result);
      assert.equal((await rows(otherSession)).length, 1);
    });
    await check('account ' + index + ' cannot insert a document for another owner', async () => {
      const result = await request('/rest/v1/budget_data', {
        token: session.access_token,
        method: 'POST',
        body: {
          user_id: otherSession.user.id,
          state: { [year]: { integrationRun: run, unauthorized: true } }
        }
      });
      denied(result);
      assert.equal((await rows(otherSession))[0].state?.[year]?.unauthorized, undefined);
    });
    await check('account ' + index + ' cannot change budget document ownership', async () => {
      const result = await request(ownPath, {
        token: session.access_token,
        method: 'PATCH',
        body: { user_id: randomUUID() }
      });
      denied(result);
      assert.equal((await rows(session))[0].user_id, session.user.id);
    });
    await check('account ' + index + ' refreshes its real session', async () => {
      const result = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: session.refresh_token }
      });
      success(result, 'Refresh test session');
      assert.equal(result.data?.user?.id, session.user.id);
      Object.assign(session, result.data);
      assert.equal((await rows(session))[0].user_id, session.user.id);
    });
  }

  await check('anonymous reads cannot access budget documents', async () => {
    const result = await request(tablePath());
    denied(result);
  });
  await check('anonymous inserts cannot create budget documents', async () => {
    const result = await request('/rest/v1/budget_data', {
      method: 'POST',
      body: { user_id: randomUUID(), state: { [year]: { integrationRun: run } } }
    });
    denied(result);
  });
  for (const method of ['PATCH', 'DELETE']) {
    await check('anonymous ' + method + ' cannot modify budget documents', async () => {
      const result = await request(tablePath('&user_id=eq.' + encodeURIComponent(sessions[0].user.id)), {
        method,
        body: method === 'PATCH' ? { state: { [year]: { integrationRun: run } } } : undefined
      });
      denied(result);
    });
  }
} catch (error) {
  failures++;
  const code = error?.message || 'unknown setup error';
  console.error('FAIL setup at ' + setupStep + ': ' + code);
} finally {
  for (const { session } of created) {
    await check('cleanup owned synthetic budget document', async () => {
      const current = await rows(session);
      const row = current.find(item => item.user_id === session.user.id);
      if (row) {
        assert.equal(row.state?.[year]?.integrationRun, run,
          'Refusing to delete a document not created by this run');
        const result = await request(tablePath('&user_id=eq.' + encodeURIComponent(session.user.id)), {
          token: session.access_token,
          method: 'DELETE'
        });
        success(result, 'Delete owned synthetic budget document');
      }
      assert.deepEqual(await rows(session), []);
    });
  }
  for (const session of sessions) {
    await check('sign out test session', async () => {
      const result = await request('/auth/v1/logout?scope=local', {
        token: session.access_token,
        method: 'POST'
      });
      assert([200, 204].includes(result.status) ||
        ([403, 404].includes(result.status) && result.data?.code === 'session_not_found'));
    });
  }
}

process.exitCode = failures ? 1 : 0;
