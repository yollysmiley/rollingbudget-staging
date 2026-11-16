import test from 'node:test';
import assert from 'node:assert/strict';
import { availableBudgetYears, isBudgetYear, localBudgetYears, rollingBudgetYears, selectableBudgetYears, sameBudgetDocument } from '../scripts/year-discovery.mjs';

test('three-year availability rolls forward automatically without creating documents', () => {
  assert.deepEqual(rollingBudgetYears(2026), ['2026', '2027', '2028']);
  assert.deepEqual(rollingBudgetYears(2027), ['2027', '2028', '2029']);
  assert.deepEqual(rollingBudgetYears(2199), ['2199', '2200']);
  assert.throws(() => rollingBudgetYears(1899), /Invalid current budget year/);
});

test('historical and future storage records remain discoverable without expanding the selectable window', () => {
  assert.deepEqual(availableBudgetYears(2027, [2023, 2035, 2027], [], 'owner_budget_'),
    ['2023', '2027', '2028', '2029', '2035']);
  assert.deepEqual(selectableBudgetYears(2027), ['2027', '2028', '2029']);
});

test('local-only years and unsynced conflict markers are discovered for the owner', () => {
  const keys = [
    'stage_owner-a_budget_2028', 'stage_owner-a_budget_2028_cloud_conflict',
    'stage_owner-a_budget_2035', 'stage_owner-b_budget_2040',
    'stage_owner-a_budget_2036_pre_income_migration', 'stage_owner-a_budget_not-year',
    'stage_owner-a_budget_9999'
  ];
  assert.deepEqual(localBudgetYears(keys, 'stage_owner-a_budget_'), ['2028', '2028', '2035']);
  assert.deepEqual(availableBudgetYears(2026, [], keys, 'stage_owner-a_budget_'),
    ['2026', '2027', '2028', '2035']);
  assert.deepEqual(selectableBudgetYears(2026), ['2026', '2027', '2028']);
});

test('invalid year identifiers are rejected', () => {
  for (const value of ['2027x', '9999', '1899', '20', '', '2027_cloud_conflict']) {
    assert.equal(isBudgetYear(value), false);
  }
  assert.equal(isBudgetYear('2027'), true);
});

test('jsonb key reordering does not invent local/cloud conflicts', () => {
  const left = { months: [{ income: [{ amount: 42, name: 'Pay' }], fixed: [] }], autoCascade: true };
  const right = { autoCascade: true, months: [{ fixed: [], income: [{ name: 'Pay', amount: 42 }] }] };
  assert.equal(sameBudgetDocument(left, right), true);
  right.months[0].income[0].amount = 43;
  assert.equal(sameBudgetDocument(left, right), false);
});
