import test from 'node:test';
import assert from 'node:assert/strict';
import { planRecurringIdentityMigration } from '../scripts/recurring-identity-plan.mjs';

const history = {
  2026: { recurringRules: [{ id: 7, name: 'Rent', amount: 100 }] },
  2027: { recurringRules: [{ id: '7', name: 'Rent', amount: 110 }] }
};
const manifest = { complete: true, expectedYears: ['2026', '2027'] };
const key = year => JSON.stringify([year, '7']);

test('numeric IDs require explicit normalization and source decisions', () => {
  const snapshot = structuredClone(history);
  const plan = planRecurringIdentityMigration(history, manifest);
  assert.equal(plan.ready, false);
  assert.equal(plan.unresolved.filter(x => x.type === 'decision-required').length, 2);
  assert.deepEqual(history, snapshot);
});

test('cross-year merge remains blocked for semantic review even when IDs are mapped', () => {
  const plan = planRecurringIdentityMigration(history, manifest, {
    [key('2026')]: 'rent', [key('2027')]: 'rent'
  });
  assert.equal(plan.ready, false);
  assert.equal(plan.unresolved[0].type, 'cross-year-definition-review');
  assert.equal(plan.groups[0].sources.length, 2);
});

test('separate explicit identities can be previewed without mutating budgets', () => {
  const plan = planRecurringIdentityMigration(history, manifest, {
    [key('2026')]: 'rent-2026', [key('2027')]: 'rent-2027'
  });
  assert.equal(plan.ready, true);
  assert.equal(plan.groups.length, 2);
  assert.equal(plan.historicalDocumentsUnchanged, true);
});

test('same-year collisions and missing IDs remain blocked', () => {
  const years = { 2026: { recurringRules: [{ id: 1 }, { id: 2 }, { name: 'Missing' }] } };
  const plan = planRecurringIdentityMigration(years, { complete: true, expectedYears: ['2026'] }, {
    [JSON.stringify(['2026', '1'])]: 'same',
    [JSON.stringify(['2026', '2'])]: 'same'
  });
  assert.equal(plan.ready, false);
  assert.ok(plan.unresolved.some(x => x.type === 'same-year-identity-collision'));
  assert.ok(plan.unresolved.some(x => x.type === 'missing-id'));
});

test('incomplete year manifests are rejected before planning', () => {
  assert.throws(() => planRecurringIdentityMigration(history, {
    complete: true, expectedYears: ['2026']
  }), /Incomplete/);
});
