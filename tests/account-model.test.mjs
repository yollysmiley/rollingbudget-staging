import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_ACCOUNTS, normalizeAccounts, migrateLegacyIncome, migrateLegacyYear, accountIncluded, totalForAccounts, canRemoveAccount, requiredLegacyAccounts } from '../scripts/account-model.mjs';

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

test('legacy income columns protect both source accounts until migration completes', () => {
  const year = { months: [{ income: [{ name: 'Pay', cpm: 150, usaa: 0 }] }] };
  assert.equal(canRemoveAccount('cpm', { 2026: year }), false);
  assert.equal(canRemoveAccount('usaa', { 2026: year }), false);

  const migrated = migrateLegacyYear(year);
  assert.equal(migrated.changed, true);
  assert.equal(canRemoveAccount('cpm', { 2026: migrated.year }), false);
  assert.equal(canRemoveAccount('usaa', { 2026: migrated.year }), true);
  assert.equal(migrateLegacyYear(migrated.year).changed, false);
});

test('year migration is idempotent, immutable, and preserves all months and metadata', () => {
  const original = { autoCascade: true, recurringRules: [{ id: 'r' }], months: [
    { name: 'Jan', income: [{ name: 'Pay', cpm: 100, usaa: 25, recurringRuleId: 'r', note: 'kept' }] },
    { name: 'Feb', income: [{ name: 'Modern', accountId: 'custom', amount: 50 }] }
  ] };
  const first = migrateLegacyYear(original);
  assert.equal(first.changed, true);
  assert.deepEqual(first.year.months[0].income, [
    { name: 'Pay', recurringRuleId: 'r', note: 'kept', amount: 100, accountId: 'cpm' },
    { name: 'Pay', recurringRuleId: 'r', note: 'kept', amount: 25, accountId: 'usaa' }
  ]);
  assert.deepEqual(original.months[0].income[0], { name: 'Pay', cpm: 100, usaa: 25, recurringRuleId: 'r', note: 'kept' });
  const second = migrateLegacyYear(first.year);
  assert.equal(second.changed, false);
  assert.strictEqual(second.year, first.year);
  assert.deepEqual(first.year.recurringRules, original.recurringRules);
});
test('zero-value income is migrated once without duplicating entries', () => {
  const year = { months: [{ income: [{ name: 'Empty', cpm: 0, usaa: 0 }] }] };
  const first = migrateLegacyYear(year);
  assert.deepEqual(first.year.months[0].income, [{ name: 'Empty', amount: 0, accountId: 'cpm' }]);
  assert.equal(migrateLegacyYear(first.year).changed, false);
});

test('migration rejects absent source accounts without modifying original income', () => {
  const year = { months: [{ income: [{ name: 'Pay', cpm: 10, usaa: 20 }] }] };
  assert.throws(() => migrateLegacyYear(year, [{ id: 'cpm' }]), /Missing legacy income account: usaa/);
  assert.equal(year.months[0].income[0].usaa, 20);
  assert.deepEqual(migrateLegacyIncome([{ name: 'Zero', cpm: 0, usaa: 0 }], [{ id: 'usaa' }]), [{ name: 'Zero', amount: 0, accountId: 'usaa' }]);
  assert.deepEqual(migrateLegacyIncome([{ name: 'Zero', cpm: 0, usaa: 0 }], []), [{ name: 'Zero', amount: 0, accountId: null }]);
  assert.equal(canRemoveAccount('cpm', { 2026: { months: [{ income: [{ cpm: 0, usaa: 0 }] }] } }), false);
});

test('legacy account discovery excludes zero-dollar sources but preserves referenced accounts', () => {
  assert.deepEqual(requiredLegacyAccounts({}), []);
  const years = {
    2024: { months: [{ income: [{ name: 'Old', cpm: 0, usaa: 0 }] }] },
    2025: { months: [{ income: [{ name: 'Salary', cpm: 40, usaa: 0 }] }] }
  };
  assert.deepEqual(requiredLegacyAccounts(years).map(a => a.id), ['cpm']);
  years[2024].months[0].fixed = [{ accountId: 'usaa', amount: 0 }];
  assert.deepEqual(requiredLegacyAccounts(years).map(a => a.id), ['cpm', 'usaa']);
});
