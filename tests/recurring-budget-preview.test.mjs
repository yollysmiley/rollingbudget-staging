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

test('untagged historical same-name transactions require review without being changed', () => {
  const source = budget();
  source.months[0].variable.push({ name: '  RENT ', amount: 650 });
  const result = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(result.added, 11);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.ambiguous.length, 1);
  assert.deepEqual(result.document.months[0].variable, source.months[0].variable);
  assert.deepEqual(result.document.months[0].fixed, []);
  assert.deepEqual(source.months[0].fixed, []);
});

test('ambiguous renamed historical entry is skipped until explicitly approved', () => {
  const source = budget();
  source.months[0].variable.push({ name: 'Rent payment', amount: 500, accountId: null });
  const before = structuredClone(source);
  const pending = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(pending.added, 11);
  assert.equal(pending.ambiguous.length, 1);
  assert.equal(pending.ambiguous[0].matches[0].category, 'variable');
  assert.deepEqual(source, before);
  const approved = previewRecurringYear(source, 2027, [rule()],
    { approvedOccurrenceIds: [pending.ambiguous[0].occurrenceId] });
  assert.equal(approved.added, 12);
  assert.equal(approved.document.months[0].fixed.length, 1);
  assert.deepEqual(source, before);
});

test('different amounts or accounts remain reviewable when names are similar', () => {
  const source = budget();
  source.months[0].variable.push({ name: 'Rent payment', amount: 200, accountId: 'other' });
  const result = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.added, 11);
});

test('exact-name historical entries require explicit approval and preserve originals', () => {
  const source = budget();
  source.months[0].fixed.push({ name: 'Rent', amount: 500 });
  const result = previewRecurringYear(source, 2027, [rule()],
    { approvedOccurrenceIds: [JSON.stringify(['rent', '2027-01-01'])] });
  assert.equal(result.added, 12);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.document.months[0].fixed.length, 2);
  assert.deepEqual(result.document.months[0].fixed[0], source.months[0].fixed[0]);
});

test('individual approvals include only selected ambiguous occurrences', () => {
  const source = budget();
  source.months[0].fixed.push({ name: 'Rent payment', amount: 500 });
  source.months[1].variable.push({ name: 'Rent invoice', amount: 700, accountId: 'other' });
  const pending = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(pending.ambiguous.length, 2);
  const approved = previewRecurringYear(source, 2027, [rule()],
    { approvedOccurrenceIds: [pending.ambiguous[0].occurrenceId] });
  assert.equal(approved.added, 11);
  assert.equal(approved.document.months[0].fixed.length, 2);
  assert.equal(approved.document.months[1].fixed.length, 0);
  assert.deepEqual(source.months[1].variable[0], { name: 'Rent invoice', amount: 700, accountId: 'other' });
});

test('unrelated descriptions sharing a generic word do not block scheduling', () => {
  const source = budget();
  source.months[0].variable.push({ name: 'Monthly groceries', amount: 120, accountId: 'other' });
  const named = { ...rule(), name: 'Monthly Internet',
    versions: [{ ...rule().versions[0], name: 'Monthly Internet' }] };
  const result = previewRecurringYear(source, 2027, [named]);
  assert.equal(result.ambiguous.length, 0);
  assert.equal(result.added, 12);
});

test('distinctive renamed transaction with same amount and account is reviewed', () => {
  const source = budget();
  source.months[0].variable.push({ name: 'Rent apartment', amount: 500 });
  const result = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.added, 11);
});

test('different amounts with exact or distinctive leading names still require review', () => {
  const source = budget();
  source.months[0].variable.push({ name: 'Rent', amount: 850, accountId: 'new-account' });
  const result = previewRecurringYear(source, 2027, [rule()]);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.added, 11);
});

test('date-driven backfill respects start/end dates and never rewrites previously edited occurrences', () => {
  const source = budget();
  const dated = {
    ...rule(), startDate: '2027-02-15', endDate: '2027-04-20',
    versions: [{ effectiveFrom: '2027-02-01', name: 'Rent', amount: 500,
      due: '15', accountId: null, frequency: 'monthly' }]
  };
  source.months[1].fixed.push({
    name: 'Manually adjusted rent', amount: 425, recurringRuleId: 'rent',
    occurrenceId: JSON.stringify(['rent', '2027-02-15'])
  });
  const before = structuredClone(source);
  const result = previewRecurringYear(source, 2027, [dated]);
  assert.equal(result.added, 2);
  assert.deepEqual(result.document.months[1].fixed, before.months[1].fixed);
  assert.deepEqual(result.document.months[2].fixed.map(x => x.occurrenceId),
    [JSON.stringify(['rent', '2027-03-15'])]);
  assert.deepEqual(result.document.months[3].fixed.map(x => x.occurrenceId),
    [JSON.stringify(['rent', '2027-04-15'])]);
  assert.equal(result.document.months[4].fixed.length, 0);
  assert.equal(previewRecurringYear(result.document, 2027, [dated]).added, 0);
  assert.deepEqual(source, before);
});
