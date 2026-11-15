import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecurringPreviewRules, previewLoadedRecurringYear } from '../scripts/recurring-app-service.mjs';

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
