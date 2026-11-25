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

// Account references include historical versions, even when rules are disabled.
const referenceObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireReferenceObject(value) {
  if (!referenceObject(value)) throw new TypeError('Invalid account reference object');
}
function requireReferenceArray(value) {
  if (!Array.isArray(value)) throw new TypeError('Invalid account reference collection');
}
function collectAccountFields(entry, refs) {
  requireReferenceObject(entry);
  let prior;
  for (const field of ['accountId', 'account_id', 'acct']) {
    if (!Object.hasOwn(entry, field)) continue;
    const id = entry[field];
    if (id === null || id === '') continue;
    if (typeof id !== 'string' || !id.trim() || id !== id.trim() || [...id].length > 80) throw new TypeError('Invalid account reference');
    if (prior !== undefined && prior !== id) throw new TypeError('Conflicting account aliases');
    prior = id;
    refs.add(id);
  }
}
export function extractRuleAccountRefs(rules, refs = new Set()) {
  requireReferenceArray(rules);
  for (const rule of rules) {
    collectAccountFields(rule, refs);
    if (Object.hasOwn(rule, 'versions')) extractRuleAccountRefs(rule.versions, refs);
  }
  return refs;
}
export function extractBudgetAccountRefs(year) {
  requireReferenceObject(year);
  const refs = new Set();
  if (Object.hasOwn(year, 'recurringRules')) extractRuleAccountRefs(year.recurringRules, refs);
  if (!Object.hasOwn(year, 'months')) return refs;
  requireReferenceArray(year.months);
  for (const month of year.months) {
    requireReferenceObject(month);
    for (const key of ['income', 'fixed', 'variable', 'creditCards', 'loans', 'expenses']) {
      if (!Object.hasOwn(month, key)) continue;
      requireReferenceArray(month[key]);
      for (const entry of month[key]) {
        collectAccountFields(entry, refs);
        if (key === 'income') {
          for (const id of ['cpm', 'usaa']) {
            const raw = entry[id];
            if (raw == null || (typeof raw === 'string' && !raw.trim())) continue;
            if (!['string','number'].includes(typeof raw) || !/^[+-]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(String(raw).trim()) || !Number.isFinite(Number(raw))) throw new TypeError('Invalid legacy income');
            if (Number(raw) !== 0) refs.add(id);
          }
        }
      }
    }
  }
  return refs;
}
export function requiredLegacyAccounts(yearDocuments = {}) {
  requireReferenceObject(yearDocuments);
  const required = new Set();
  for (const year of Object.values(yearDocuments)) {
    for (const id of extractBudgetAccountRefs(year)) required.add(id);
  }
  return LEGACY_ACCOUNTS.filter(account => required.has(account.id));
}

export function migrateLegacyIncome(income, accounts = LEGACY_ACCOUNTS) {
  if (!Array.isArray(income)) throw new TypeError('Income must be an array');
  return income.flatMap(entry => {
    if (entry.accountId || (!Object.hasOwn(entry, 'cpm') && !Object.hasOwn(entry, 'usaa'))) return [{ ...entry }];
    const sources = ['cpm', 'usaa'].filter(id => (Number(entry[id]) || 0) !== 0);
    for (const id of sources) if (!accounts.some(account => account.id === id)) throw new Error('Missing legacy income account: ' + id);
    if (!sources.length) {
      const { cpm, usaa, ...rest } = entry;
      const fallback = ['cpm', 'usaa'].find(id => accounts.some(account => account.id === id));
      return [{ ...rest, amount: 0, accountId: fallback || null }];
    }
    return sources.map(id => {
      const { cpm, usaa, ...rest } = entry;
      return { ...rest, amount: Number(entry[id]) || 0, accountId: id };
    });
  });
}

export function migrateLegacyYear(year, accounts = LEGACY_ACCOUNTS) {
  if (!year?.months) throw new TypeError('Year months are required');
  let changed = false;
  const months = year.months.map(month => {
    const income = month.income || [];
    if (!income.some(entry => !entry.accountId && (Object.hasOwn(entry, 'cpm') || Object.hasOwn(entry, 'usaa')))) return month;
    changed = true;
    return { ...month, income: migrateLegacyIncome(income, accounts) };
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
  if (typeof accountId !== 'string' || !accountId.trim()) return false;
  try {
    requireReferenceObject(yearDocuments);
    return !Object.values(yearDocuments).some(year => extractBudgetAccountRefs(year).has(accountId));
  } catch {
    return false; // Malformed inventories cannot establish safe deletion.
  }
}
