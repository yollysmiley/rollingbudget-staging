import test from 'node:test';
import assert from 'node:assert/strict';
import { writeBudgetRevision } from '../scripts/budget-revision.mjs';
import { createAccount, updateAccount, deleteAccount, loadOrSeedAccounts } from '../scripts/account-storage.mjs';

// Two independently-created client contexts share a disposable, synthetic cloud state.
// No production accounts or previously recorded budget data are involved.
function isolatedCloud() {
  const budgets = new Map();
  const accounts = new Map();
  const clone = value => structuredClone(value);
  const key = (owner, id) => owner + ':' + id;
  const scoped = (owner, table) => {
    if (table === 'budget_ui_years') return {
      insert: async entry => {
        if (owner !== entry.user_id) return { error: new Error('owner denied') };
        const id = key(entry.user_id, entry.year);
        if (budgets.has(id)) return { error: new Error('duplicate budget year') };
        budgets.set(id, clone(entry));
        return { error: null };
      },
      update: patch => {
        const filters = {};
        const q = {
          eq(field, value) { filters[field] = value; return q; },
          async select() {
            const id = key(filters.user_id, filters.year), entry = budgets.get(id);
            if (owner !== filters.user_id || !entry || entry.updated_at !== filters.updated_at)
              return { data: [], error: null };
            budgets.set(id, { ...entry, ...clone(patch) });
            return { data: [{ year: entry.year }], error: null };
          }
        };
        return q;
      }
    };
    if (table !== 'budget_accounts') throw new Error('Unexpected table');
    return {
      insert: async row => {
        if (owner !== row.user_id) return { error: new Error('owner denied') };
        const id = key(row.user_id, row.id);
        if (accounts.has(id)) return { error: new Error('duplicate account') };
        accounts.set(id, { ...clone(row), updated_at: '2026-01-01T00:00:00.000Z' });
        return { error: null };
      },
      select: () => {
        const filters = {};
        const q = {
          eq(field, value) { filters[field] = value; return q; },
          then(resolve, reject) {
            return Promise.resolve({ data: [...accounts.values()].filter(row =>
              owner === row.user_id && Object.entries(filters).every(([k,v]) => row[k] === v))
              .map(clone), error: null }).then(resolve, reject);
          }
        };
        return q;
      },
      update: patch => mutation('update', patch),
      delete: () => mutation('delete')
    };
    function mutation(kind, patch) {
      const filters = {};
      const q = {
        eq(field, value) { filters[field] = value; return q; },
        async select() {
          if (owner !== filters.user_id) return { data: [], error: null };
          const id = key(filters.user_id, filters.id), row = accounts.get(id);
          if (!row || !Object.entries(filters).every(([k,v]) => row[k] === v))
            return { data: [], error: null };
          if (kind === 'delete') accounts.delete(id);
          else accounts.set(id, { ...row, ...clone(patch) });
          return { data: [{ id: row.id }], error: null };
        }
      };
      return q;
    }
  };
  return {
    connect(owner) { return { from: name => scoped(owner, name) }; },
    budget(owner, year) { return clone(budgets.get(key(owner, year))); },
    account(owner, id) { const row = accounts.get(key(owner,id)); return row && clone(row); }
  };
}

test('two browser contexts cannot overwrite divergent budget snapshots or another user', async () => {
  const store = isolatedCloud(), a1 = store.connect('owner-a'), a2 = store.connect('owner-a'), b = store.connect('owner-b');
  const first = await writeBudgetRevision(a1, {
    owner: 'owner-a', year: 2027, document: { months: ['base'] },
    requestedAt: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(first.inserted, true);
  const oldRev = first.updatedAt;
  const updated = await writeBudgetRevision(a2, {
    owner: 'owner-a', year: 2027, document: { months: ['newer'] },
    knownRevision: oldRev, requestedAt: '2026-01-02T00:00:00.000Z'
  });
  assert.equal(updated.inserted, false);
  await assert.rejects(writeBudgetRevision(a1, {
    owner: 'owner-a', year: 2027, document: { months: ['stale'] },
    knownRevision: oldRev, requestedAt: '2026-01-03T00:00:00.000Z'
  }), /another device/);
  await assert.rejects(writeBudgetRevision(b, {
    owner: 'owner-a', year: 2027, document: { months: ['cross-owner'] },
    knownRevision: updated.updatedAt, requestedAt: '2026-01-04T00:00:00.000Z'
  }), /another device/);
  assert.deepEqual(store.budget('owner-a', 2027).budget_data, { months: ['newer'] });
  assert.equal(store.budget('owner-b', 2027), undefined);
});

test('two account contexts must reload after a conflicting edit; other owners are isolated', async () => {
  const store = isolatedCloud(), alice1 = store.connect('alice'), alice2 = store.connect('alice'), bob = store.connect('bob');
  const one = await loadOrSeedAccounts(alice1, 'alice'), two = await loadOrSeedAccounts(alice2, 'alice');
  assert.deepEqual(one, []);
  assert.deepEqual(two, []);
  await createAccount(alice1, 'alice', one, 'Checking', 'checking');
  const a1 = await loadOrSeedAccounts(alice1, 'alice');
  const a2 = await loadOrSeedAccounts(alice2, 'alice');
  assert.equal(a1[0].updatedAt, '2026-01-01T00:00:00.000Z');
  await updateAccount(alice2, 'alice', a2, 'checking', { name: 'Travel checking' });
  await assert.rejects(updateAccount(alice1, 'alice', a1, 'checking', { included: false }), /another device/);
  await assert.rejects(deleteAccount(alice1, 'alice', a1, 'checking', {}), /another device/);
  assert.equal(store.account('alice', 'checking').included, true);
  assert.equal(store.account('alice', 'checking').name, 'Travel checking');
  assert.deepEqual(await loadOrSeedAccounts(bob, 'bob'), []);
  await assert.rejects(updateAccount(bob, 'bob', a1, 'checking', { name: 'Other' }), /another device/);
  assert.equal(store.account('bob', 'checking'), undefined);
});
