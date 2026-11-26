import { requiredLegacyAccounts, normalizeAccounts, canRemoveAccount } from './account-model.mjs';
import { nextBudgetRevision } from './budget-revision.mjs';

function accountCatalog(rows) {
  const normalized = normalizeAccounts(rows);
  return normalized.map(account => {
    const row = rows.find(item => item.id === account.id);
    return row?.updated_at ? { ...account, updatedAt: row.updated_at } : account;
  });
}

// Only backfill legacy accounts supported by actual budget references.
export async function loadOrSeedAccounts(client, userId, yearDocuments = {}) {
  if (!client || !userId) throw new Error('Authenticated client and user ID required');
  const table = client.from('budget_accounts');
  const initial = await table.select('id,name,included,updated_at').eq('user_id', userId);
  if (initial.error) throw initial.error;
  const existing = accountCatalog(initial.data ?? []);
  const seed = requiredLegacyAccounts(yearDocuments).filter(account => !existing.some(item => item.id === account.id)).map(account => ({ ...account, user_id: userId }));
  if (!seed.length) return existing;
  // Upsert with ignoreDuplicates protects against concurrent first loads.
  const inserted = await table.upsert(seed, { onConflict: 'user_id,id', ignoreDuplicates: true });
  if (inserted.error) throw inserted.error;
  const final = await table.select('id,name,included,updated_at').eq('user_id', userId);
  if (final.error) throw final.error;
  return accountCatalog(final.data ?? []);
}

export async function createAccount(client, userId, accounts, name, id, included = true) {
  const normalized = normalizeAccounts([...accounts, { id, name, included: Boolean(included) }]);
  const account = normalized.at(-1);
  const { error } = await client.from('budget_accounts').insert({ ...account, user_id: userId });
  if (error) throw error;
  return account;
}

// Guard against stale browser account catalogs before every destructive mutation.
// The updated_at predicate also rejects a race between the read and the write.
async function requireUnchangedAccount(client, userId, accounts, id) {
  if (!client || !userId || !id) throw new Error('Authenticated account write scope is invalid');
  const expected = accounts.find(item => item.id === id);
  if (!expected) throw new Error('Account not found');
  const { data, error } = await client.from('budget_accounts')
    .select('id,name,included,updated_at').eq('user_id', userId).eq('id', id);
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Account changed on another device; reload accounts before editing');
  }
  const latest = data[0];
  if (latest.name !== expected.name || Boolean(latest.included) !== Boolean(expected.included) ||
      !expected.updatedAt || expected.updatedAt !== latest.updated_at ||
      typeof latest.updated_at !== 'string' || !Number.isFinite(Date.parse(latest.updated_at))) {
    throw new Error('Account changed on another device; reload accounts before editing');
  }
  return latest.updated_at;
}

export async function updateAccount(client, userId, accounts, id, patch) {
  const current = accounts.find(item => item.id === id);
  if (!current) throw new Error('Account not found');
  const updated = normalizeAccounts(accounts.map(item => item.id === id ? { ...item, ...patch, id } : item)).find(item => item.id === id);
  const knownRevision = await requireUnchangedAccount(client, userId, accounts, id);
  const nextRevision = nextBudgetRevision(new Date().toISOString(), knownRevision);
  const { data, error } = await client.from('budget_accounts')
    .update({ name: updated.name, included: updated.included, updated_at: nextRevision })
    .eq('user_id', userId).eq('id', id).eq('updated_at', knownRevision).select('id');
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Account changed on another device; reload accounts before editing');
  }
  return updated;
}

export async function deleteAccount(client, userId, accounts, id, years) {
  if (!accounts.some(item => item.id === id)) throw new Error('Account not found');
  if (!canRemoveAccount(id, years)) throw new Error('Reassign existing budget entries and recurring rules before removing this account');
  // Saved year budgets are not the sole source of account dependencies: global
  // recurring rules may be disabled, historical, or scheduled for a future year.
  const { data: rules, error: rulesError } = await client.from('budget_recurring_rules')
    .select('id').eq('user_id', userId).eq('account_id', id);
  if (rulesError) throw rulesError;
  if (!Array.isArray(rules)) throw new Error('Could not verify recurring account references');
  if (rules.length) {
    throw new Error('Reassign existing budget entries or recurring rules before removing this account');
  }
  // Owner-scoped CAS prevents stale browser deletions. The composite FK also
  // protects against a rule being created after the application-side preflight.
  const knownRevision = await requireUnchangedAccount(client, userId, accounts, id);
  let data, error;
  try {
    ({ data, error } = await client.from('budget_accounts').delete()
      .eq('user_id', userId).eq('id', id).eq('updated_at', knownRevision).select('id'));
  } catch (deleteError) {
    if (deleteError?.code === '23503') {
      throw new Error('Reassign existing budget entries or recurring rules before removing this account');
    }
    throw deleteError;
  }
  if (error?.code === '23503') {
    throw new Error('Reassign existing budget entries or recurring rules before removing this account');
  }
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Account changed on another device; reload accounts before removing');
  }
}
