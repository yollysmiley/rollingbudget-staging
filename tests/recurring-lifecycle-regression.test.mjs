import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledOccurrences, appendMissingOccurrences } from '../scripts/recurring-scheduler.mjs';

const base = () => ({
  id: 'rent', name: 'Rent', category: 'fixed', amount: 900, due: '15',
  accountId: 'checking', startDate: '2026-11-15', endDate: null,
  frequency: 'monthly', active: true,
  versions: [{ effectiveFrom: '2026-11-01', name: 'Rent', amount: 900,
    due: '15', accountId: 'checking', frequency: 'monthly' }]
});

test('suspension and later reactivation fill only months allowed by the original anchor', () => {
  const rule = { ...base(), versions: [
    ...base().versions,
    { effectiveFrom: '2027-02-01', name: 'Rent', amount: 900,
      due: '15', accountId: 'checking', frequency: 'monthly', enabled: false },
    { effectiveFrom: '2027-05-01', name: 'Rent', amount: 950,
      due: '15', accountId: 'checking', frequency: 'every-2-months', enabled: true }
  ] };
  const entries = scheduledOccurrences(rule, 2027);
  assert.deepEqual(entries.map(entry => entry.scheduledMonth),
    ['2027-01-15', '2027-05-15', '2027-07-15', '2027-09-15', '2027-11-15']);
  assert.deepEqual(entries.map(entry => entry.amount), [900, 950, 950, 950, 950]);
  assert.equal(scheduledOccurrences(rule, 2026).length, 2);
});

test('future-effective edits do not overwrite previously generated or manually adjusted entries', () => {
  const initial = base();
  const edited = { ...initial, versions: [...initial.versions,
    { effectiveFrom: '2027-07-01', name: 'Rent', amount: 1250,
      due: '15', accountId: 'checking', frequency: 'monthly' }
  ] };
  const existing = [
    { ...scheduledOccurrences(initial, 2027)[0], amount: 777 },
    { name: 'Custom budget entry', amount: 44 }
  ];
  const snapshot = structuredClone(existing);
  const result = appendMissingOccurrences(existing, scheduledOccurrences(edited, 2027));
  assert.equal(result.length, 13);
  assert.deepEqual(result.slice(0, 2), snapshot);
  assert.deepEqual(result.filter(entry => entry.scheduledMonth === '2027-06-15').map(entry => entry.amount), [900]);
  assert.deepEqual(result.filter(entry => entry.scheduledMonth === '2027-07-15').map(entry => entry.amount), [1250]);
  assert.deepEqual(appendMissingOccurrences(result, scheduledOccurrences(edited, 2027)), result);
  assert.deepEqual(existing, snapshot);
});

test('disabling preserves previously saved entries and an end date blocks later reactivation', () => {
  const initial = base();
  const saved = [scheduledOccurrences(initial, 2027)[0], { name: 'Manual rent', amount: 25 }];
  const ended = { ...initial, endDate: '2027-04-20', versions: [...initial.versions,
    { effectiveFrom: '2027-02-01', name: 'Rent', amount: 900,
      due: '15', accountId: 'checking', frequency: 'monthly', enabled: false },
    { effectiveFrom: '2027-05-01', name: 'Rent', amount: 900,
      due: '15', accountId: 'checking', frequency: 'monthly', enabled: true }
  ] };
  const additions = scheduledOccurrences(ended, 2027);
  assert.deepEqual(additions.map(entry => entry.scheduledMonth), ['2027-01-15']);
  assert.deepEqual(appendMissingOccurrences(saved, additions), saved);
});
