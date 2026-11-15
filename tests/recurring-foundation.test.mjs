import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecurringRule } from '../scripts/recurring-foundation.mjs';

const rule = () => ({
  id: 'rent', name: 'Rent', category: 'fixed', amount: 900,
  due: '1st', accountId: null, startDate: '2027-01-01',
  frequency: 'monthly'
});

test('new owner-scoped recurring definitions have stable identifiers and no legacy source', () => {
  const normalized = normalizeRecurringRule(rule());
  assert.equal(normalized.id, 'rent');
  assert.equal(normalized.versions[0].effectiveFrom, '2027-01-01');
  assert.equal(normalized.versions[0].amount, 900);
  assert.equal(normalized.sourceYear, undefined);
});

test('validates amounts, frequencies, dates, categories and identifiers', () => {
  for (const invalid of [
    { id: '' }, { name: '' }, { amount: -1 }, { amount: '900' },
    { frequency: 'weekly' }, { category: 'other' },
    { startDate: '2027-02-30' }, { endDate: '2026-01-01' }
  ]) assert.throws(() => normalizeRecurringRule({ ...rule(), ...invalid }));
});

test('normalization never mutates a source budget transaction', () => {
  const entry = { name: 'Rent', amount: 900, accountId: 'checking' };
  const before = structuredClone(entry);
  normalizeRecurringRule({ ...rule(), name: entry.name, amount: entry.amount });
  assert.deepEqual(entry, before);
});


test('supports full start dates and optional end dates with strict calendar validation', () => {
  const result = normalizeRecurringRule({ ...rule(), startDate: '2027-01-31', endDate: '2027-03-15' });
  assert.equal(result.startDate, '2027-01-31');
  assert.equal(result.endDate, '2027-03-15');
  assert.equal(result.versions[0].effectiveFrom, '2027-01-01');
  assert.throws(() => normalizeRecurringRule({ ...rule(), startDate: '2027-02-29' }), /start date/);
  assert.equal(normalizeRecurringRule({ ...rule(), startDate: '2028-02-29' }).startDate, '2028-02-29');
});
