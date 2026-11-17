import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOrSeedAccounts } from '../scripts/account-storage.mjs';

function mockClient(initial = []) {
  const rows = [...initial];
  let writes = 0;
  const table = {
    select() { return { eq() { return Promise.resolve({ data: rows.map(({ user_id, ...rest }) => rest), error: null }); } }; },
    async upsert(items, opts) {
      writes++;
      assert.equal(opts.onConflict, 'user_id,id');
      assert.equal(opts.ignoreDuplicates, true);
      for (const item of items) if (!rows.some(x => x.id === item.id && x.user_id === item.user_id)) rows.push(item);
      return { error: null };
    }
  };
  return { client: { from(name) { assert.equal(name, 'budget_accounts'); return table; } }, rows, get writes() { return writes; } };
}

test('new users and zero-dollar legacy budgets do not receive default accounts', async () => {
  const mock = mockClient();
  assert.deepEqual(await loadOrSeedAccounts(mock.client, 'user-1'), []);
  assert.deepEqual(await loadOrSeedAccounts(mock.client, 'user-1', {
    2026: { months: [{ income: [{ name: 'Empty', cpm: 0, usaa: 0 }] }] }
  }), []);
  assert.equal(mock.writes, 0);
});

test('seeds only accounts with nonzero historical legacy income', async () => {
  const mock = mockClient();
  const years = { 2025: { months: [{ income: [{ name: 'Salary', cpm: 125, usaa: 0 }] }] } };
  assert.deepEqual((await loadOrSeedAccounts(mock.client, 'user-1', years)).map(x => x.id), ['cpm']);
  assert.equal(mock.writes, 1);
  assert.ok(mock.rows.every(x => x.user_id === 'user-1'));
  await loadOrSeedAccounts(mock.client, 'user-1', years);
  assert.equal(mock.writes, 1);
});

test('keeps account-linked historical references and does not restore deleted unreferenced accounts', async () => {
  const mock = mockClient([{ id: 'custom', name: 'Savings', included: false, user_id: 'user-1' }]);
  const years = { 2026: { months: [{ income: [{ name: 'Prior', accountId: 'usaa', amount: 0 }] }] } };
  assert.deepEqual((await loadOrSeedAccounts(mock.client, 'user-1', years)).map(x => x.id), ['custom', 'usaa']);
  assert.equal(mock.writes, 1);
  const clean = mockClient([{ id: 'custom', name: 'Savings', included: false, user_id: 'user-1' }]);
  assert.deepEqual((await loadOrSeedAccounts(clean.client, 'user-1')).map(x => x.id), ['custom']);
  assert.equal(clean.writes, 0);
});

test('repeated initialization preserves user-renamed and excluded accounts', async () => {
  const mock = mockClient([{ id: 'cpm', name: 'Checking', included: false, user_id: 'user-1' }]);
  assert.deepEqual(await loadOrSeedAccounts(mock.client, 'user-1'), [{ id: 'cpm', name: 'Checking', included: false }]);
  assert.equal(mock.writes, 0);
});

test('does not seed if account lookup fails or authentication is absent', async () => {
  await assert.rejects(() => loadOrSeedAccounts(null, null), /Authenticated/);
  const client = { from() { return { select() { return { eq: async () => ({ error: new Error('offline') }) }; } }; } };
  await assert.rejects(() => loadOrSeedAccounts(client, 'user-1'), /offline/);
});

test('migration does not change existing year documents or income totals', async () => {
  const legacy = { months: [{ income: [{ name: 'Salary', cpm: 120, usaa: 80 }] }] };
  const snapshot = structuredClone(legacy);
  await loadOrSeedAccounts(mockClient().client, 'user-1');
  assert.deepEqual(legacy, snapshot);
  assert.equal(legacy.months[0].income[0].cpm + legacy.months[0].income[0].usaa, 200);
});

test('account creation validates duplicates before writing', async () => {
  const { createAccount } = await import('../scripts/account-storage.mjs');
  const mock = mockClient();
  await assert.rejects(() => createAccount(mock.client, 'user-1', [{ id: 'cpm', name: 'Checking', included: true }], 'checking', 'new'), /unique/);
  assert.equal(mock.writes, 0);
});

test('account update rejects unknown accounts before contacting database', async () => {
  const { updateAccount } = await import('../scripts/account-storage.mjs');
  await assert.rejects(() => updateAccount(mockClient().client, 'user-1', [], 'missing', { name: 'Other' }), /not found/);
});

test('account removal blocks referenced entries and recurring rules', async () => {
  const { deleteAccount } = await import('../scripts/account-storage.mjs');
  const accounts = [{ id: 'cpm', name: 'CPM Federal', included: true }, { id: 'savings', name: 'Savings', included: true }];
  await assert.rejects(() => deleteAccount(mockClient().client, 'user-1', accounts, 'cpm', { 2026: { months: [{ fixed: [{ accountId: 'cpm' }] }] } }), /Reassign/);
  await assert.rejects(() => deleteAccount(mockClient().client, 'user-1', accounts, 'cpm', { 2026: { months: [], recurringRules: [{ acct: 'cpm' }] } }), /Reassign/);
});

function versionedAccountClient(initial, beforeMutation = null, options = {}) {
  const rows = structuredClone(initial);
  const operations = [];
  const table = {
    select() {
      const filters = {};
      const query = {
        eq(key, value) { filters[key] = value; return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: rows.filter(row => Object.entries(filters).every(([key, value]) =>
            row[key] === value)).map(row => ({ ...row })), error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    update(payload) { return mutation('update', payload); },
    delete() { return mutation('delete'); }
  };
  function mutation(kind, payload) {
    const filters = {};
    const query = {
      eq(key, value) { filters[key] = value; return query; },
      async select() {
        if (beforeMutation) beforeMutation({ rows, filters, kind });
        if (kind === 'delete' && options.deletionError) {
          operations.push({ kind, filters: { ...filters }, affected: 0 });
          return { data: [], error: options.deletionError };
        }
        const found = rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        operations.push({ kind, filters: { ...filters }, affected: found.length });
        for (const row of found) {
          if (kind === 'update') Object.assign(row, payload);
          else rows.splice(rows.indexOf(row), 1);
        }
        return { data: found.map(row => ({ id: row.id })), error: null };
      }
    };
    return query;
  }
  const recurringTable = {
    select(fields) {
      assert.equal(fields, 'id');
      const filters = {};
      const query = {
        eq(key, value) { filters[key] = value; return query; },
        then(resolve, reject) {
          const data = (options.rules || []).filter(rule =>
            Object.entries(filters).every(([key, value]) => rule[key] === value))
            .map(rule => ({ id: rule.id }));
          return Promise.resolve({ data, error: options.rulesError || null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  return { client: { from(tableName) {
    if (tableName === 'budget_recurring_rules') return recurringTable;
    assert.equal(tableName, 'budget_accounts');
    return table;
  } }, rows, operations };
}

const priorAccount = () => ({ id: 'custom', name: 'Custom', included: true, updatedAt: '2026-11-01T00:00:00.000Z' });
const savedAccount = () => ({ ...priorAccount(), user_id: 'user-1', updated_at: '2026-11-01T00:00:00.000Z' });

test('account updates use owner and timestamp CAS, and stale catalogs cannot overwrite them', async () => {
  const { updateAccount } = await import('../scripts/account-storage.mjs');
  const fixture = versionedAccountClient([savedAccount()]);
  const before = [priorAccount()];
  const result = await updateAccount(fixture.client, 'user-1', before, 'custom', { name: 'Renamed' });
  assert.deepEqual(result, { id: 'custom', name: 'Renamed', included: true });
  assert.equal(fixture.rows[0].name, 'Renamed');
  assert.ok(Date.parse(fixture.rows[0].updated_at) > Date.parse('2026-11-01T00:00:00.000Z'));
  assert.deepEqual(Object.keys(fixture.operations[0].filters), ['user_id', 'id', 'updated_at']);
  await assert.rejects(updateAccount(fixture.client, 'user-1', before, 'custom', { name: 'Stale' }), /another device/);
  await assert.rejects(updateAccount(fixture.client, 'other-user', before, 'custom', { name: 'Forbidden' }), /another device/);
  assert.equal(fixture.rows[0].name, 'Renamed');
  assert.equal(fixture.operations.length, 1);
});

test('account edit detects a concurrent update between read and write', async () => {
  const { updateAccount } = await import('../scripts/account-storage.mjs');
  const fixture = versionedAccountClient([savedAccount()], ({ rows }) => {
    rows[0].updated_at = '2026-11-02T00:00:00.000Z';
  });
  await assert.rejects(updateAccount(fixture.client, 'user-1', [priorAccount()], 'custom',
    { included: false }), /another device/);
  assert.equal(fixture.rows[0].included, true);
  assert.deepEqual(fixture.operations[0].affected, 0);
});

test('last unreferenced account is removable only at the expected owner revision', async () => {
  const { deleteAccount } = await import('../scripts/account-storage.mjs');
  const fixture = versionedAccountClient([savedAccount()]);
  await assert.doesNotReject(() => deleteAccount(fixture.client, 'user-1', [priorAccount()], 'custom', {}));
  assert.equal(fixture.rows.length, 0);
  assert.deepEqual(Object.keys(fixture.operations[0].filters), ['user_id', 'id', 'updated_at']);
  const stale = versionedAccountClient([{ ...savedAccount(), name: 'Already changed' }]);
  await assert.rejects(deleteAccount(stale.client, 'user-1', [priorAccount()], 'custom', {}), /another device/);
  assert.equal(stale.rows.length, 1);
});

test('account edits reject a stale revision even when a remote change restores identical field values', async () => {
  const { updateAccount } = await import('../scripts/account-storage.mjs');
  const current = savedAccount();
  current.updated_at = '2026-11-03T00:00:00.000Z';
  const fixture = versionedAccountClient([current]);
  await assert.rejects(updateAccount(fixture.client, 'user-1', [priorAccount()],
    'custom', { included: false }), /another device/);
  assert.equal(fixture.rows[0].included, true);
  assert.equal(fixture.operations.length, 0);
});

test('global recurring dependencies block account removal regardless of disabled, future or historical status', async () => {
  const { deleteAccount } = await import('../scripts/account-storage.mjs');
  const cases = [
    { id: 'disabled-rule', active: false, start_date: '2026-01-15' },
    { id: 'future-rule', active: true, start_date: '2029-12-31' },
    { id: 'historical-rule', active: false, source_year: 2024 }
  ];
  for (const rule of cases) {
    const fixture = versionedAccountClient([savedAccount()], null, {
      rules: [{ ...rule, user_id: 'user-1', account_id: 'custom' }]
    });
    await assert.rejects(
      deleteAccount(fixture.client, 'user-1', [priorAccount()], 'custom', {}),
      /Reassign or remove global recurring rules/
    );
    assert.equal(fixture.operations.length, 0);
    assert.equal(fixture.rows.length, 1);
  }
});

test('global rule preflight is owner scoped and preserves unreferenced account deletion', async () => {
  const { deleteAccount } = await import('../scripts/account-storage.mjs');
  const fixture = versionedAccountClient([savedAccount()], null, {
    rules: [{ user_id: 'other-owner', account_id: 'custom', id: 'foreign-rule' }]
  });
  await deleteAccount(fixture.client, 'user-1', [priorAccount()], 'custom', {});
  assert.equal(fixture.rows.length, 0);
  assert.deepEqual(Object.keys(fixture.operations[0].filters), ['user_id', 'id', 'updated_at']);
});

test('failed global rule lookup fails closed without deleting account', async () => {
  const { deleteAccount } = await import('../scripts/account-storage.mjs');
  const fixture = versionedAccountClient([savedAccount()], null, {
    rulesError: new Error('recurring catalog unavailable')
  });
  await assert.rejects(deleteAccount(fixture.client, 'user-1', [priorAccount()], 'custom', {}),
    /recurring catalog unavailable/);
  assert.equal(fixture.operations.length, 0);
  assert.equal(fixture.rows.length, 1);
});

test('concurrent recurring reference FK violation aborts account delete without partial changes', async () => {
  const { deleteAccount } = await import('../scripts/account-storage.mjs');
  const fixture = versionedAccountClient([savedAccount()], null, {
    deletionError: Object.assign(new Error('foreign key violation'), { code: '23503' })
  });
  await assert.rejects(deleteAccount(fixture.client, 'user-1', [priorAccount()], 'custom', {}),
    /Reassign or remove global recurring rules/);
  assert.equal(fixture.operations.length, 1);
  assert.equal(fixture.rows.length, 1);
  assert.equal(fixture.rows[0].id, 'custom');
});
