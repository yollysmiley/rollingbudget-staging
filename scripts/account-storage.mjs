import { requiredLegacyAccounts, normalizeAccounts, canRemoveAccount } from './account-model.mjs';

// Only backfill legacy accounts supported by actual budget references.
export async function loadOrSeedAccounts(client, userId, yearDocuments = {}) {
  if (!client || !userId) throw new Error('Authenticated client and user ID required');
  const table = client.from('budget_accounts');
  const initial = await table.select('id,name,included').eq('user_id', userId);
  if (initial.error) throw initial.error;
  const existing = normalizeAccounts(initial.data ?? []);
  const seed = requiredLegacyAccounts(yearDocuments).filter(account => !existing.some(item => item.id === account.id)).map(account => ({ ...account, user_id: userId }));
  if (!seed.length) return existing;
  // Upsert with ignoreDuplicates protects against concurrent first loads.
  const inserted = await table.upsert(seed, { onConflict: 'user_id,id', ignoreDuplicates: true });
  if (inserted.error) throw inserted.error;
  const final = await table.select('id,name,included').eq('user_id', userId);
  if (final.error) throw final.error;
  return normalizeAccounts(final.data ?? []);
}

export async function createAccount(client, userId, accounts, name, id) {
  const normalized = normalizeAccounts([...accounts, { id, name, included: true }]);
  const account = normalized.at(-1);
  const { error } = await client.from('budget_accounts').insert({ ...account, user_id: userId });
  if (error) throw error;
  return account;
}

export async function updateAccount(client, userId, accounts, id, patch) {
  const current = accounts.find(item => item.id === id);
  if (!current) throw new Error('Account not found');
  const updated = normalizeAccounts(accounts.map(item => item.id === id ? { ...item, ...patch, id } : item)).find(item => item.id === id);
  const { data, error } = await client.from('budget_accounts').update({ name: updated.name, included: updated.included, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Account update was not saved');
  return updated;
}

export async function deleteAccount(client, userId, accounts, id, years) {
  if (!accounts.some(item => item.id === id)) throw new Error('Account not found');
  if (!canRemoveAccount(id, years)) throw new Error('Reassign existing budget entries and recurring rules before removing this account');
  const { data, error } = await client.from('budget_accounts').delete().eq('user_id', userId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Account removal was not saved');
}
