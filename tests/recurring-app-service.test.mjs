import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecurringPreviewRules, previewLoadedRecurringYear, createRecurringRule, setRecurringRuleActive, removeRecurringRule, commitRecurringYear } from '../scripts/recurring-app-service.mjs';

const rule = { id: 'rent', name: 'Rent', category: 'fixed', amount: '500', due: '1st',
  account_id: null, frequency: 'monthly', start_date: '2026-12-01',
  end_date: null, active: true, source_year: null,
  versions: [{ effectiveFrom: '2026-12-01', name: 'Rent', amount: 500,
    due: '1st', accountId: null, frequency: 'monthly' }] };
const budget = () => ({ months: Array.from({ length: 12 }, () => ({
  income: [], fixed: [], variable: [], loans: [], creditCards: []
})) });

test('loads only authenticated owner rules and holds historical imports for review', async () => {
  const client = { from(table) {
    assert.equal(table, 'budget_recurring_rules');
    return { select(fields) {
      assert.ok(fields.includes('source_year'));
      return { eq(field, id) {
        assert.equal(field, 'user_id');
        assert.equal(id, 'user-a');
        return Promise.resolve({ data: [rule, { ...rule, id: 'legacy', source_year: 2026 }], error: null });
      } };
    } };
  } };
  const loaded = await loadRecurringPreviewRules(client, 'user-a');
  assert.equal(loaded.rules.length, 1);
  assert.equal(loaded.held, 1);
  const source = budget();
  const result = previewLoadedRecurringYear(source, '2027', loaded);
  assert.equal(result.added, 12);
  assert.equal(source.months[0].fixed.length, 0);
  assert.equal(result.document.months[0].fixed[0].amount, 500);
});

test('rejects malformed or failed loads without modifying budgets', async () => {
  await assert.rejects(() => loadRecurringPreviewRules(null, null), /Authenticated/);
  const client = { from() { return { select() { return { eq: async () => ({
    data: [{ ...rule, versions: [] }], error: null
  }) }; } }; } };
  await assert.rejects(() => loadRecurringPreviewRules(client, 'user-a'), /versions/);
  const failed = { from() { return { select() { return { eq: async () => ({
    data: null, error: new Error('offline')
  }) }; } }; } };
  await assert.rejects(() => loadRecurringPreviewRules(failed, 'user-a'), /offline/);
});

test('shared recurring rule writes are owner-scoped and never modify historical budget transactions', async () => {
  const calls = [];
  const client = { from(table) {
    assert.equal(table, 'budget_recurring_rules');
    return {
      async insert(row) { calls.push(['insert', row]); return { error: null }; },
      update(changes) { return { eq(field, owner) {
        assert.equal(field, 'user_id'); assert.equal(owner, 'owner-a');
        return { async eq(key, id) { calls.push(['update', changes, key, id]); return { error: null }; } };
      } }; },
      delete() { return { eq(field, owner) {
        assert.equal(field, 'user_id'); assert.equal(owner, 'owner-a');
        return { async eq(key, id) { calls.push(['delete', key, id]); return { error: null }; } };
      } }; }
    };
  } };
  const historical = budget();
  historical.months[0].fixed.push({ name: 'Old rent', amount: 999 });
  const snapshot = structuredClone(historical);
  const created = await createRecurringRule(client, 'owner-a', {
    id: 'new-rent', name: 'Rent', category: 'fixed', amount: 1000,
    frequency: 'monthly', startDate: '2027-01-01'
  });
  assert.equal(created.id, 'new-rent');
  assert.equal(calls[0][1].user_id, 'owner-a');
  assert.equal(calls[0][1].source_year, null);
  await setRecurringRuleActive(client, 'owner-a', 'new-rent', false);
  await removeRecurringRule(client, 'owner-a', 'new-rent');
  assert.deepEqual(calls[1], ['update', { active: false }, 'id', 'new-rent']);
  assert.deepEqual(calls[2], ['delete', 'id', 'new-rent']);
  assert.deepEqual(historical, snapshot);
});

test('recurring cloud commit rejects stale revisions without modifying source budgets', async () => {
  const source = budget();
  const rows = [{ year: 2027, budget_data: source, updated_at: '2026-11-15T00:00:00.000Z' }];
  let conflicted = true;
  const client = { from(table) {
    assert.equal(table, 'budget_ui_years');
    return {
      select() { return { eq() { return { async eq() { return { data: rows, error: null }; } }; } }; },
      update(changes) {
        assert.equal(changes.budget_data.months[0].fixed.length, 1);
        return { eq() { return { eq() { return { eq(field, value) {
          assert.equal(field, 'updated_at');
          assert.equal(value, rows[0].updated_at);
          return { async select() { return { data: conflicted ? [] : [{ year: 2027 }], error: null }; } };
        } }; } }; } };
      }
    };
  } };
  const build = doc => {
    const copy = structuredClone(doc);
    copy.months[0].fixed.push({ name: 'Scheduled', amount: 10 });
    return { document: copy, added: 1, skipped: [] };
  };
  await assert.rejects(() => commitRecurringYear(client, 'owner-a', 2027, build), /changed on another device/);
  assert.equal(source.months[0].fixed.length, 0);
  conflicted = false;
  const saved = await commitRecurringYear(client, 'owner-a', 2027, build);
  assert.equal(saved.saved, true);
  assert.equal(saved.document.months[0].fixed.length, 1);
  assert.equal(source.months[0].fixed.length, 0);
});
