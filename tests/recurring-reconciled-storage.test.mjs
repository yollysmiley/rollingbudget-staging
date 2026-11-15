import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateReconciledRecurringRules } from '../scripts/recurring-reconciled-storage.mjs';

const years = {
  2026: { recurringRules: [{ id: 7, cat: 'fixed', name: 'Rent', amount: 100, startMonth: 10, frequency: 'monthly' }],
    months: [{ fixed: [{ name: 'Rent', amount: 100, recurringRuleId: 7 }] }] },
  2027: { recurringRules: [{ id: '7', cat: 'fixed', name: 'Rent', amount: 110, startMonth: 0, frequency: 'monthly' }],
    months: [{ fixed: [{ name: 'Rent', amount: 110, recurringRuleId: '7' }] }] }
};
const manifest = { complete: true, expectedYears: ['2026', '2027'] };
const decisions = {
  [JSON.stringify(['2026', '7'])]: 'rent-2026',
  [JSON.stringify(['2027', '7'])]: 'rent-2027'
};

test('migration writes normalized, owner-scoped records and preserves original documents', async () => {
  const original = structuredClone(years);
  const stored = new Map();
  let calls = 0;
  const client = { from(table) {
    assert.equal(table, 'budget_recurring_rules');
    return { async upsert(rows, options) {
      calls++;
      assert.deepEqual(options, { onConflict: 'user_id,id', ignoreDuplicates: true });
      for (const row of rows) {
        assert.equal(row.user_id, 'owner-a');
        assert.equal(row.source_rule_id, '7');
        assert.ok(row.id.startsWith('rent-'));
        assert.equal(row.start_date.endsWith('-01'), true);
        if (!stored.has(row.id)) stored.set(row.id, row);
      }
      return { error: null };
    } };
  } };
  assert.deepEqual(await migrateReconciledRecurringRules(client, 'owner-a', years, manifest, decisions),
    { discovered: 2, attempted: 2 });
  await migrateReconciledRecurringRules(client, 'owner-a', years, manifest, decisions);
  assert.equal(stored.size, 2);
  assert.equal(calls, 2);
  assert.equal(stored.get('rent-2026').amount, 100);
  assert.equal(stored.get('rent-2027').amount, 110);
  assert.deepEqual(years, original);
});

test('unreviewed cross-year merges and missing decisions never write', async () => {
  let writes = 0;
  const client = { from() { writes++; throw new Error('unexpected write'); } };
  await assert.rejects(() => migrateReconciledRecurringRules(client, 'owner-a', years, manifest, {}),
    /migration blocked/);
  await assert.rejects(() => migrateReconciledRecurringRules(client, 'owner-a', years, manifest, {
    [JSON.stringify(['2026', '7'])]: 'rent',
    [JSON.stringify(['2027', '7'])]: 'rent'
  }), /migration blocked/);
  await assert.rejects(() => migrateReconciledRecurringRules(client, 'owner-a', years, {
    complete: true, expectedYears: ['2026']
  }, decisions), /Incomplete/);
  assert.equal(writes, 0);
});

test('empty account writes nothing and database errors propagate', async () => {
  let calls = 0;
  const client = { from() {
    calls++;
    return { async upsert() { return { error: new Error('offline') }; } };
  } };
  assert.deepEqual(await migrateReconciledRecurringRules(client, 'owner-a', {}, {
    complete: true, expectedYears: []
  }, {}), { discovered: 0, attempted: 0 });
  assert.equal(calls, 0);
  await assert.rejects(() => migrateReconciledRecurringRules(client, 'owner-a', years, manifest, decisions), /offline/);
  assert.equal(calls, 1);
  await assert.rejects(() => migrateReconciledRecurringRules(null, null, years, manifest, decisions), /Authenticated/);
});

test('invalid legacy definitions fail before any database write', async () => {
  const invalid = structuredClone(years);
  invalid[2027].recurringRules[0].amount = -5;
  let calls = 0;
  const client = { from() { calls++; throw new Error('unexpected write'); } };
  await assert.rejects(() => migrateReconciledRecurringRules(client, 'owner-a', invalid, manifest, decisions), /amount/);
  assert.equal(calls, 0);
});
