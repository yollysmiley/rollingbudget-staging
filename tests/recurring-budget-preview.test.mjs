import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRecurringYear } from '../scripts/recurring-budget-preview.mjs';

const budget = () => ({ autoCascade: true, months: Array.from({ length: 12 }, () => ({
  income: [], fixed: [], variable: [], loans: [], creditCards: [], recordedLeftover: 0
})) });
const rule = (category = 'fixed') => ({
  id: 'rent', name: 'Rent', category, amount: 500, due: '1st',
  startDate: '2026-12-01', frequency: 'monthly', active: true,
  versions: [{ effectiveFrom: '2026-12-01', name: 'Rent', amount: 500,
    due: '1st', accountId: null, frequency: 'monthly' }]
});

test('cross-year preview preserves source budget and emits stable occurrences', () => {
  const source = budget();
  const result = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(result.added, 12);
  assert.equal(source.months[0].fixed.length, 0);
  assert.equal(result.document.months[0].fixed[0].amount, 500);
  assert.equal(result.document.months[0].fixed[0].recurringRuleId, 'rent');
  assert.equal(result.document.months[0].fixed[0].occurrenceId, JSON.stringify(['rent', '2027-01-01']));
  assert.equal(previewRecurringYear(result.document, 2027, [rule()]).added, 0);
});

test('legacy entries and manually edited values are never replaced', () => {
  const source = budget();
  source.months[0].fixed.push({ name: 'Edited Rent', amount: 300, recurringRuleId: 'rent' });
  const result = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(result.added, 11);
  assert.deepEqual(result.document.months[0].fixed, source.months[0].fixed);
});

test('blocked identities generate nothing and preserve all existing entries', () => {
  const source = budget();
  const result = previewRecurringYear(source, 2027, [rule()], { blockedRuleIds: ['rent'] });
  assert.equal(result.added, 0);
  assert.deepEqual(result.document, source);
});

test('loan and credit card occurrences use existing budget fields', () => {
  for (const [category, target, field] of [['loan', 'loans', 'payment'], ['cc', 'creditCards', 'payment']]) {
    const result = previewRecurringYear(budget(), 2027, [rule(category)]);
    assert.equal(result.document.months[0][target][0][field], 500);
    assert.equal(result.document.months[0][target][0].amount, undefined);
  }
});

test('incomplete documents are rejected rather than silently repaired', () => {
  assert.throws(() => previewRecurringYear({ months: [] }, 2027, [rule()]), /12-month/);
  const bad = budget();
  delete bad.months[0].creditCards;
  assert.throws(() => previewRecurringYear(bad, 2027, [rule()]), /category/);
});

test('a manually moved recurring entry blocks duplicate creation in another category', () => {
  const source = budget();
  source.months[0].variable.push({ name: 'Moved rent', amount: 275, recurringRuleId: 'rent' });
  const result = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(result.added, 11);
  assert.equal(result.document.months[0].fixed.length, 0);
  assert.equal(result.document.months[0].variable[0].amount, 275);
  assert.deepEqual(source.months[0].variable, result.document.months[0].variable);
});

test('untagged historical same-name transactions block duplicate generation without being changed', () => {
  const source = budget();
  source.months[0].variable.push({ name: '  RENT ', amount: 650 });
  const result = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(result.added, 11);
  assert.equal(result.skipped.length, 1);
  assert.deepEqual(result.document.months[0].variable, source.months[0].variable);
  assert.deepEqual(result.document.months[0].fixed, []);
  assert.deepEqual(source.months[0].fixed, []);
});
