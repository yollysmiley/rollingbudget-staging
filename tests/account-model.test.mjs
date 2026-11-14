import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_ACCOUNTS, normalizeAccounts, migrateLegacyIncome, accountIncluded, totalForAccounts, canRemoveAccount } from '../scripts/account-model.mjs';

test('legacy accounts are present and included by default', () => {
  assert.deepEqual(LEGACY_ACCOUNTS.map(x => x.id), ['cpm', 'usaa']);
  assert.ok(LEGACY_ACCOUNTS.every(x => x.included));
});

test('account names and IDs must be valid and unique', () => {
  assert.throws(() => normalizeAccounts([{ id: 'a', name: 'Bank' }, { id: 'b', name: 'bank' }]), /unique/);
  assert.throws(() => normalizeAccounts([{ id: '', name: 'Bank' }]), /required/);
  assert.deepEqual(normalizeAccounts([{ id: 'a', name: 'Bank', included: false }])[0].included, false);
});

test('migration splits both legacy income columns without losing amounts or rule links', () => {
  const input = [{ name: 'Pay', cpm: 200, usaa: 300, recurringRuleId: 'rule-1' }];
  assert.deepEqual(migrateLegacyIncome(input), [
    { name: 'Pay', amount: 200, accountId: 'cpm', recurringRuleId: 'rule-1' },
    { name: 'Pay', amount: 300, accountId: 'usaa', recurringRuleId: 'rule-1' }
  ]);
  assert.equal(input[0].cpm, 200);
});

test('migration preserves zero-income records and already migrated entries', () => {
  assert.equal(migrateLegacyIncome([{ name: 'Empty', cpm: 0, usaa: 0 }]).length, 1);
  assert.deepEqual(migrateLegacyIncome([{ name: 'New', amount: 25, accountId: 'custom' }]), [{ name: 'New', amount: 25, accountId: 'custom' }]);
});

test('excluded accounts are omitted from totals without deleting records', () => {
  const accounts = normalizeAccounts([{ id: 'a', name: 'A', included: false }, { id: 'b', name: 'B' }]);
  const entries = [{ accountId: 'a', amount: 75 }, { accountId: 'b', amount: 20 }];
  assert.equal(totalForAccounts(entries, accounts, 'amount'), 20);
  assert.equal(entries.length, 2);
  assert.equal(accountIncluded(undefined, accounts), true);
  assert.throws(() => accountIncluded('missing', accounts), /Unknown account/);
});

test('accounts referenced by any month or recurring rule cannot be removed', () => {
  const year = { months: [{ fixed: [{ accountId: 'a', amount: 20 }] }], recurringRules: [] };
  assert.equal(canRemoveAccount('a', { 2026: year }), false);
  assert.equal(canRemoveAccount('b', { 2026: year }), true);
  year.recurringRules.push({ acct: 'b' });
  assert.equal(canRemoveAccount('b', { 2026: year }), false);
});
