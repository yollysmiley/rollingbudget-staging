import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecurringRule, collectLegacyRecurringRules } from '../scripts/recurring-foundation.mjs';
import { migrateRecurringRules } from '../scripts/recurring-storage.mjs';

const manifest = { complete: true, expectedYears: ['2026'] };
const historical = { 2026: { recurringRules: [
  { id: 'mortgage', cat: 'fixed', name: 'Mortgage', amount: 1850, startMonth: 2, frequency: 'monthly', acct: 'checking' },
  { id: 'annual', cat: 'income', name: 'Bonus', amount: 100, startMonth: 10, frequency: 'annually', active: false }
], months: [{ fixed: [{ name: 'Mortgage', amount: 1850, recurringRuleId: 'mortgage' }] }] } };

test('new users have no recurring rules or seeded accounts', () => {
  assert.deepEqual(collectLegacyRecurringRules({ 2026: { recurringRules: [], months: [] } }), []);
  assert.deepEqual(collectLegacyRecurringRules({}), []);
});

test('legacy rules gain calendar dates and stable source identifiers without mutating historical years', () => {
  const input = structuredClone(historical);
  const rules = collectLegacyRecurringRules(input);
  assert.equal(rules[0].startDate, '2026-03-01');
  assert.equal(rules[0].id, 'legacy-2026-mortgage');
  assert.equal(rules[0].accountId, 'checking');
  assert.equal(rules[1].active, false);
  assert.equal(rules[1].frequency, 'annually');
  assert.deepEqual(input, historical);
  assert.deepEqual(collectLegacyRecurringRules(input), rules);
});

test('validation rejects invalid dates, frequencies and amounts', () => {
  const rule = { id: 'a', name: 'Rent', category: 'fixed', amount: 100, startDate: '2026-01-01' };
  assert.equal(normalizeRecurringRule(rule).versions[0].effectiveFrom, '2026-01-01');
  assert.throws(() => normalizeRecurringRule({ ...rule, startDate: '2026-02-15' }), /start date/);
  assert.throws(() => normalizeRecurringRule({ ...rule, endDate: '2025-01-01' }), /end date/);
  assert.throws(() => normalizeRecurringRule({ ...rule, frequency: 'weekly' }), /frequency/);
  assert.throws(() => normalizeRecurringRule({ ...rule, amount: -1 }), /amount/);
});

test('migration writes only user-owned rows and retries idempotently', async () => {
  const stored = new Map();
  let calls = 0;
  const client = { from(table) {
    assert.equal(table, 'budget_recurring_rules');
    return { async upsert(rows, options) {
      calls++;
      assert.deepEqual(options, { onConflict: 'user_id,id', ignoreDuplicates: true });
      for (const row of rows) {
        assert.equal(row.user_id, 'user-a');
        assert.equal(row.account_id, row.id.endsWith('mortgage') ? 'checking' : null);
        const key = row.user_id + ':' + row.id;
        if (!stored.has(key)) stored.set(key, row);
      }
      return { error: null };
    } };
  } };
  assert.deepEqual(await migrateRecurringRules(client, 'user-a', {}, { complete: true, expectedYears: [] }), { discovered: 0 });
  assert.equal(calls, 0);
  await migrateRecurringRules(client, 'user-a', historical, manifest);
  await migrateRecurringRules(client, 'user-a', historical, manifest);
  assert.equal(stored.size, 2);
  assert.equal(calls, 2);
  assert.equal(historical[2026].months[0].fixed.length, 1);
});

test('migration rejects unauthenticated writes and propagates database errors', async () => {
  await assert.rejects(() => migrateRecurringRules(null, null, historical, manifest), /Authenticated/);
  const client = { from() { return { upsert: async () => ({ error: new Error('offline') }) }; } };
  await assert.rejects(() => migrateRecurringRules(client, 'user-a', historical, manifest), /offline/);
});

test('rejects missing, partial and mismatched year manifests before any write', async () => {
  let writes = 0;
  const client = { from() { writes++; throw new Error('unexpected write'); } };
  await assert.rejects(() => migrateRecurringRules(client, 'user-a', historical), /manifest/);
  await assert.rejects(() => migrateRecurringRules(client, 'user-a', historical, { complete: false, expectedYears: ['2026'] }), /manifest/);
  await assert.rejects(() => migrateRecurringRules(client, 'user-a', historical, { complete: true, expectedYears: ['2026', '2027'] }), /Incomplete/);
  await assert.rejects(() => migrateRecurringRules(client, 'user-a', historical, { complete: true, expectedYears: ['2026', '2026'] }), /Incomplete/);
  assert.equal(writes, 0);
});

test('requires stable legacy IDs even after reordering historical records', () => {
  const input = structuredClone(historical);
  delete input[2026].recurringRules[0].id;
  assert.throws(() => collectLegacyRecurringRules(input), /Stable legacy rule ID/);
  input[2026].recurringRules.reverse();
  assert.throws(() => collectLegacyRecurringRules(input), /Stable legacy rule ID/);
});

test('rejects repeated rule IDs across years pending explicit historical reconciliation', async () => {
  const twoYears = structuredClone(historical);
  twoYears[2027] = structuredClone(historical[2026]);
  assert.throws(() => collectLegacyRecurringRules(twoYears), /multiple years/);
  let writes = 0;
  const client = { from() { writes++; throw new Error('unexpected write'); } };
  await assert.rejects(() => migrateRecurringRules(client, 'user-a', twoYears, { complete: true, expectedYears: ['2026', '2027'] }), /multiple years/);
  assert.equal(writes, 0);
});

test('rejects invalid categories, identifiers and amounts', () => {
  const base = { id: 'rule-1', name: 'Rent', category: 'fixed', amount: 100, startDate: '2026-01-01' };
  assert.throws(() => normalizeRecurringRule({ ...base, id: '' }), /identifier/);
  assert.throws(() => normalizeRecurringRule({ ...base, category: 'other' }), /category/);
  assert.throws(() => normalizeRecurringRule({ ...base, amount: '100' }), /amount/);
  assert.throws(() => normalizeRecurringRule({ ...base, startDate: '0000-01-01' }), /start date/);
  const bad = structuredClone(historical);
  bad[2026].recurringRules[0].cat = 'other';
  assert.throws(() => collectLegacyRecurringRules(bad), /category/);
});

test('migration rejects duplicate IDs in a year and leaves original data intact', () => {
  const bad = structuredClone(historical);
  bad[2026].recurringRules.push(structuredClone(bad[2026].recurringRules[0]));
  assert.throws(() => collectLegacyRecurringRules(bad), /Duplicate legacy/);
  assert.equal(historical[2026].months[0].fixed[0].amount, 1850);
});
