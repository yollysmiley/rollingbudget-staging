import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requiredSettings, logoutAccepted } from './safety.mjs';

// B3: credentialed, owner-scoped live staging tests. No admin/service key.
const settings = requiredSettings(process.env);
const base = 'https://phiscfwfuzeptetimdbo.supabase.co';
const run = randomUUID();
const sessions = [];
const fixtures = [];
const accountId = 'b3-' + run;
const ruleId = suffix => 'b3-' + run + '-' + suffix;
let failures = 0;

async function request(session, table, method = 'GET', body, filter = '') {
  const path = table.startsWith('/') ? table : '/rest/v1/' + table + '?select=*&' + filter;
  const response = await fetch(base + path, {
    method,
    headers: {
      apikey: settings.STAGING_PUBLISHABLE_KEY,
      ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: response.ok, status: response.status, data };
}
function good(response, label) {
  assert(response.ok, label + ' HTTP ' + response.status);
  return response.data;
}
function ownFilter(session, id) {
  return 'user_id=eq.' + encodeURIComponent(session.user.id) + '&id=eq.' + encodeURIComponent(id);
}
async function get(session, table, id) {
  return good(await request(session, table, 'GET', undefined, ownFilter(session, id)), 'read ' + table);
}
async function check(label, action) {
  try { await action(); console.log('PASS B3 ' + label); }
  catch { failures++; console.error('FAIL B3 ' + label + ' (sensitive details suppressed)'); }
}
async function createRule(session, suffix, options = {}) {
  const id = ruleId(suffix);
  assert.deepEqual(await get(session, 'budget_recurring_rules', id), [], 'Rule fixture collision');
  const row = {
    user_id: session.user.id, id, name: 'B3 integration ' + run + ' ' + suffix,
    category: 'fixed', amount: 1, frequency: 'monthly', due_day: 15,
    start_date: '2028-01-15', end_date: null, active: true,
    versions: [], account_id: accountId, ...options
  };
  const created = good(await request(session, 'budget_recurring_rules', 'POST', row), 'create rule');
  assert.equal(created?.[0]?.id, id);
  return id;
}
async function deleteAccount(session) {
  return request(session, 'budget_accounts', 'DELETE', undefined, ownFilter(session, accountId));
}
async function assertPresent(session, id) {
  const account = await get(session, 'budget_accounts', accountId);
  assert.equal(account.length, 1);
  assert.equal(account[0].name, 'B3 integration ' + run);
  const rule = await get(session, 'budget_recurring_rules', id);
  assert.equal(rule.length, 1);
  assert.equal(rule[0].account_id, accountId);
}
async function removeRule(session, id) {
  const rows = await get(session, 'budget_recurring_rules', id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'B3 integration ' + run + ' ' + id.slice(('b3-' + run + '-').length));
  const result = good(await request(session, 'budget_recurring_rules', 'DELETE', undefined, ownFilter(session, id)), 'remove rule');
  assert.equal(result.length, 1);
}
try {
  for (const letter of ['A', 'B']) {
    const session = good(await request(null, '/auth/v1/token?grant_type=password', 'POST', {
      email: settings['STAGING_TEST_' + letter + '_EMAIL'],
      password: settings['STAGING_TEST_' + letter + '_PASSWORD']
    }), 'authenticate ' + letter);
    assert(session.access_token && session.user?.id, 'Invalid staging test session');
    sessions.push(session);
  }
  assert.notEqual(sessions[0].user.id, sessions[1].user.id);
  for (const session of sessions) {
    assert.deepEqual(await get(session, 'budget_accounts', accountId), [], 'Account fixture collision');
    const inserted = good(await request(session, 'budget_accounts', 'POST', {
      user_id: session.user.id, id: accountId, name: 'B3 integration ' + run, included: true
    }), 'create account fixture');
    assert.equal(inserted?.[0]?.id, accountId);
    fixtures.push(session);
  }
  const [a,b] = sessions;
  await check('cross-owner account read is isolated', async () => {
    const rows = good(await request(a, 'budget_accounts', 'GET', undefined, ownFilter(b, accountId)), 'cross-owner read');
    assert.deepEqual(rows, []);
  });
  await check('cross-owner account deletion denied', async () => {
    const result = await request(a, 'budget_accounts', 'DELETE', undefined, ownFilter(b, accountId));
    assert(result.status === 401 || result.status === 403 || (result.ok && result.data?.length === 0));
    assert.equal((await get(b, 'budget_accounts', accountId)).length, 1);
  });
  await check('cross-owner rule account reference rejected', async () => {
    // A can see its own same-ID account; use a B-only ID to exercise the composite owner FK.
    const foreignId = 'b3-foreign-' + run;
    assert.deepEqual(await get(b, 'budget_accounts', foreignId), []);
    good(await request(b, 'budget_accounts', 'POST', {
      user_id: b.user.id, id: foreignId, name: 'B3 foreign ' + run, included: true
    }), 'create foreign account');
    try {
      const result = await request(a, 'budget_recurring_rules', 'POST', {
        user_id: a.user.id, id: ruleId('foreign'), name: 'B3 foreign rule ' + run,
        category: 'fixed', amount: 1, frequency: 'monthly',
        start_date: '2028-01-15', versions: [], account_id: foreignId
      });
      assert.equal(result.ok, false, 'Cross-owner FK was accepted');
      assert.equal(result.data?.code, '23503');
      assert.deepEqual(await get(a, 'budget_recurring_rules', ruleId('foreign')), []);
    } finally {
      const rows = await get(b, 'budget_accounts', foreignId);
      if (rows.length) {
        assert.equal(rows[0].name, 'B3 foreign ' + run);
        assert.equal(good(await request(b, 'budget_accounts', 'DELETE', undefined, ownFilter(b, foreignId)), 'remove foreign account').length, 1);
      }
    }
  });
  for (const [suffix,options] of [
    ['active',{}],
    ['disabled',{ active: false }],
    ['future',{ start_date: '2199-01-15' }],
    ['historical',{ start_date: '2020-01-15', end_date: '2020-02-15' }]
  ]) {
    await check(suffix + ' referenced account blocks deletion without partial changes', async () => {
      const id = await createRule(a, suffix, options);
      const result = await deleteAccount(a);
      assert.equal(result.ok, false, 'Referenced account deletion was accepted');
      assert.equal(result.data?.code, '23503', 'Expected PostgreSQL FK violation');
      await assertPresent(a, id);
      await removeRule(a, id);
      assert.equal((await get(a, 'budget_accounts', accountId)).length, 1);
    });
  }
  await check('nullable recurring account reference accepted', async () => {
    const id = await createRule(a, 'nullable', { account_id: null });
    assert.equal((await get(a, 'budget_recurring_rules', id))[0].account_id, null);
    await removeRule(a, id);
  });
  await check('explicit dependency removal permits deletion', async () => {
    assert.equal((await get(a, 'budget_recurring_rules', ruleId('active'))).length, 0);
    const deleted = good(await deleteAccount(a), 'delete unreferenced account');
    assert.equal(deleted.length, 1);
    assert.deepEqual(await get(a, 'budget_accounts', accountId), []);
    assert.equal((await get(b, 'budget_accounts', accountId)).length, 1);
  });
  await check('second owner can delete independent unreferenced account', async () => {
    const deleted = good(await deleteAccount(b), 'delete owner B account');
    assert.equal(deleted.length, 1);
    assert.deepEqual(await get(b, 'budget_accounts', accountId), []);
  });
} catch {
  failures++;
  console.error('FAIL B3 fixture setup (sensitive details suppressed)');
} finally {
  for (const session of fixtures) {
    await check('cleanup run-owned fixtures', async () => {
      for (const suffix of ['active','disabled','future','historical','nullable','foreign']) {
        const id = ruleId(suffix);
        const rows = await get(session, 'budget_recurring_rules', id);
        if (rows.length) {
          assert.equal(rows.length, 1);
          assert(rows[0].name?.includes(run), 'Refusing non-run-owned rule cleanup');
          good(await request(session, 'budget_recurring_rules', 'DELETE', undefined, ownFilter(session, id)), 'cleanup rule');
        }
      }
      for (const id of [accountId,'b3-foreign-' + run]) {
        const rows = await get(session, 'budget_accounts', id);
        if (rows.length) {
          assert.equal(rows.length, 1);
          assert(rows[0].name?.includes(run), 'Refusing non-run-owned account cleanup');
          good(await request(session, 'budget_accounts', 'DELETE', undefined, ownFilter(session, id)), 'cleanup account');
        }
        assert.deepEqual(await get(session, 'budget_accounts', id), []);
      }
    });
  }
  for (const session of sessions) {
    await check('sign out staging test identity', async () => {
      const result = await request(session, '/auth/v1/logout?scope=local', 'POST');
      assert(logoutAccepted(result.status, result.data));
    });
  }
}
process.exitCode = failures ? 1 : 0;
