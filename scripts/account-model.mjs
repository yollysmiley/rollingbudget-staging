// Shared, pure account-model helpers. No persistence or DOM dependencies.
export const LEGACY_ACCOUNTS = Object.freeze([
  Object.freeze({ id: 'cpm', name: 'CPM Federal', included: true }),
  Object.freeze({ id: 'usaa', name: 'USAA', included: true })
]);

export function normalizeAccounts(accounts) {
  if (!Array.isArray(accounts)) throw new TypeError('Accounts must be an array');
  const ids = new Set();
  const names = new Set();
  return accounts.map(account => {
    const id = String(account?.id ?? '').trim();
    const name = String(account?.name ?? '').trim();
    if (!id || !name) throw new Error('Account ID and name are required');
    if (ids.has(id) || names.has(name.toLocaleLowerCase('en-US'))) {
      throw new Error('Account IDs and names must be unique');
    }
    ids.add(id);
    names.add(name.toLocaleLowerCase('en-US'));
    return { id, name, included: account.included !== false };
  });
}

export function migrateLegacyIncome(income) {
  if (!Array.isArray(income)) throw new TypeError('Income must be an array');
  // Retain the original record and split only when it contains legacy columns.
  // Zero-valued legacy columns are kept in the original record, not emitted as entries.
  return income.flatMap(entry => {
    if (entry.accountId || (!Object.hasOwn(entry, 'cpm') && !Object.hasOwn(entry, 'usaa'))) return [{ ...entry }];
    const migrated = [];
    for (const id of ['cpm', 'usaa']) {
      const amount = Number(entry[id]) || 0;
      if (amount !== 0) migrated.push({ name: entry.name, amount, accountId: id, ...(entry.recurringRuleId ? { recurringRuleId: entry.recurringRuleId } : {}) });
    }
    return migrated.length ? migrated : [{ ...entry, amount: 0, accountId: 'cpm' }];
  });
}

export function accountIncluded(accountId, accounts) {
  if (!accountId) return true; // Preserve unassigned legacy entries until explicitly assigned.
  const account = accounts.find(item => item.id === accountId);
  if (!account) throw new Error('Unknown account: ' + accountId);
  return account.included !== false;
}

export function totalForAccounts(entries, accounts, amountField) {
  return entries.reduce((sum, entry) =>
    sum + (accountIncluded(entry.accountId, accounts) ? Number(entry[amountField]) || 0 : 0), 0);
}

export function canRemoveAccount(accountId, yearDocuments) {
  return !Object.values(yearDocuments).some(year =>
    year?.months?.some(month =>
      ['income', 'fixed', 'variable', 'creditCards', 'loans'].some(key =>
        month[key]?.some(entry => entry.accountId === accountId))) ||
    year?.recurringRules?.some(rule => rule.accountId === accountId || rule.acct === accountId)
  );
}
