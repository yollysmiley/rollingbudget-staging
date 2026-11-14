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

test('last unreferenced account is eligible for removal', async () => {
  const { deleteAccount } = await import('../scripts/account-storage.mjs');
  const rows = [{ id: 'custom', name: 'Custom', included: true, user_id: 'user-1' }];
  const client = { from() { return { delete() { return { eq() { return this; }, select: async () => ({ data: [{ id: 'custom' }], error: null }) }; } }; } };
  await assert.doesNotReject(() => deleteAccount(client, 'user-1', rows, 'custom', {}));
});
