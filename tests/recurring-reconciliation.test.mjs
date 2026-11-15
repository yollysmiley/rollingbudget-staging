import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRecurringHistory } from '../scripts/recurring-reconciliation.mjs';

const manifest = years => ({ complete: true, expectedYears: years });
const year = rules => ({ recurringRules: rules, months: [{ fixed: [{ name: 'Historical', amount: 50 }] }] });

test('new users and unambiguous history pass without creating records', () => {
  assert.deepEqual(inspectRecurringHistory({}, manifest([])), {
    ready: true, years: [], ruleCount: 0, issues: [], blockedRuleIds: []
  });
  const history = { 2026: year([{ id: 123 }]), 2027: year([{ id: 'other' }]) };
  const snapshot = structuredClone(history);
  assert.equal(inspectRecurringHistory(history, manifest(['2026', '2027'])).ready, true);
  assert.deepEqual(history, snapshot);
});

test('flags repeated numeric and string IDs across years rather than silently merging', () => {
  const history = { 2026: year([{ id: 123 }]), 2027: year([{ id: '123' }]) };
  const report = inspectRecurringHistory(history, manifest(['2026', '2027']));
  assert.equal(report.ready, false);
  assert.deepEqual(report.blockedRuleIds, ['123']);
  assert.deepEqual(report.issues, [{ type: 'reused-across-years', id: '123', years: ['2026', '2027'] }]);
});

test('flags missing and duplicate IDs without guessing positional identifiers', () => {
  const report = inspectRecurringHistory({
    2026: year([{ id: 'a' }, { id: 'a' }, { id: null }, { id: -1 }])
  }, manifest(['2026']));
  assert.deepEqual(report.issues.map(issue => issue.type),
    ['duplicate-in-year', 'missing-id', 'missing-id']);
  assert.equal(report.ready, false);
});

test('refuses partial or unverifiable histories', () => {
  assert.throws(() => inspectRecurringHistory({ 2026: year([]) }, manifest(['2026', '2027'])), /Incomplete/);
  assert.throws(() => inspectRecurringHistory({}, { complete: false, expectedYears: [] }), /manifest/);
  assert.deepEqual(inspectRecurringHistory({ 2026: {} }, manifest(['2026'])).issues,
    [{ type: 'missing-rules', year: '2026' }]);
});
