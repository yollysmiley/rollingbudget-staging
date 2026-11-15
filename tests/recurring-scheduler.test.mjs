import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledOccurrences, appendMissingOccurrences } from '../scripts/recurring-scheduler.mjs';

const rule = (changes = {}) => ({
  id: 'rent', name: 'Rent', category: 'fixed', amount: 900, due: '1',
  accountId: 'checking', frequency: 'monthly', startDate: '2026-11-01',
  active: true, versions: [{
    effectiveFrom: '2026-11-01', name: 'Rent', amount: 900,
    due: '1', accountId: 'checking', frequency: 'monthly'
  }], ...changes
});

test('cross-year schedule preserves original anchor', () => {
  assert.deepEqual(scheduledOccurrences(rule({ frequency: 'every-2-months', versions: [{
    effectiveFrom: '2026-11-01', name: 'Rent', amount: 900, due: '1',
    accountId: 'checking', frequency: 'every-2-months'
  }] }), 2027).map(o => o.scheduledMonth),
  ['2027-01-01', '2027-03-01', '2027-05-01', '2027-07-01', '2027-09-01', '2027-11-01']);
});

test('supports all frequency intervals and December transitions', () => {
  for (const [frequency, expected] of [
    ['monthly', 12], ['every-2-months', 6], ['quarterly', 4],
    ['every-6-months', 2], ['annually', 1]
  ]) {
    const input = rule({ startDate: '2026-12-01', frequency,
      versions: [{ effectiveFrom: '2026-12-01', name: 'Rent', amount: 900, due: '1', accountId: null, frequency }] });
    assert.equal(scheduledOccurrences(input, 2027).length, expected);
  }
});

test('respects end dates, disabled rules and future starts', () => {
  assert.deepEqual(scheduledOccurrences(rule({ active: false }), 2027), []);
  assert.deepEqual(scheduledOccurrences(rule({ endDate: '2027-02-01' }), 2027).map(x => x.scheduledMonth),
    ['2027-01-01', '2027-02-01']);
  assert.deepEqual(scheduledOccurrences(rule(), 2025), []);
});

test('uses effective-dated amounts without rewriting historical occurrences', () => {
  const input = rule({ versions: [
    { effectiveFrom: '2026-11-01', name: 'Rent', amount: 900, due: '1', accountId: 'a', frequency: 'monthly' },
    { effectiveFrom: '2027-02-01', name: 'Rent', amount: 950, due: '1', accountId: 'b', frequency: 'monthly' }
  ] });
  assert.deepEqual(scheduledOccurrences(input, 2027).slice(0, 3).map(x => [x.amount, x.accountId]),
    [[900, 'a'], [950, 'b'], [950, 'b']]);
  assert.equal(scheduledOccurrences(input, 2026)[0].amount, 900);
});

test('append is idempotent and preserves manual and previously edited entries', () => {
  const occurrences = scheduledOccurrences(rule(), 2027);
  const manual = { name: 'Manual payment', amount: 123 };
  const existing = [manual, { ...occurrences[0], amount: 777 }];
  const once = appendMissingOccurrences(existing, occurrences);
  assert.equal(once.length, 13);
  assert.equal(once[1].amount, 777);
  assert.deepEqual(appendMissingOccurrences(once, occurrences), once);
  assert.deepEqual(existing, [manual, { ...occurrences[0], amount: 777 }]);
  assert.deepEqual(appendMissingOccurrences([], occurrences, { blockedRuleIds: ['rent'] }), []);
});

test('rejects invalid version timelines and dates', () => {
  assert.throws(() => scheduledOccurrences(rule({ versions: [] }), 2027), /versions/);
  assert.throws(() => scheduledOccurrences(rule({ versions: [
    { effectiveFrom: '2027-01-01', name: 'Rent', amount: 900, frequency: 'monthly' }
  ] }), 2027), /Initial version/);
  assert.throws(() => scheduledOccurrences(rule({ startDate: '2026-02-30' }), 2027), /start date/);
  assert.throws(() => scheduledOccurrences(rule(), 0), /year/);
});
