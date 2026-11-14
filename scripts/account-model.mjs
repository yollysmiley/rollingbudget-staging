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
  return income.flatMap(entry => {
    if (entry.accountId || (!Object.hasOwn(entry, 'cpm') && !Object.hasOwn(entry, 'usaa'))) return [{ ...entry }];
    const sources = ['cpm', 'usaa'].filter(id => (Number(entry[id]) || 0) !== 0);
    if (!sources.length) {
      const { cpm, usaa, ...rest } = entry;
      return [{ ...rest, amount: 0, accountId: 'cpm' }];
    }
    return sources.map(id => {
      const { cpm, usaa, ...rest } = entry;
      return { ...rest, amount: Number(entry[id]) || 0, accountId: id };
    });
  });
}

export function migrateLegacyYear(year) {
  if (!year?.months) throw new TypeError('Year months are required');
  let changed = false;
  const months = year.months.map(month => {
    const income = month.income || [];
    if (!income.some(entry => !entry.accountId && (Object.hasOwn(entry, 'cpm') || Object.hasOwn(entry, 'usaa')))) return month;
    changed = true;
    return { ...month, income: migrateLegacyIncome(income) };
  });
  return { changed, year: changed ? { ...year, months } : year };
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
        month[key]?.some(entry => entry.accountId === accountId || (key === 'income' && (accountId === 'cpm' || accountId === 'usaa') && Number(entry[accountId]) !== 0)))) ||
    year?.recurringRules?.some(rule => rule.accountId === accountId || rule.acct === accountId)
  );
}
