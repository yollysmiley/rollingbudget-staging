import { LEGACY_ACCOUNTS, normalizeAccounts, canRemoveAccount } from './account-model.mjs';

// Seed only when the authenticated user has no account rows. Never overwrite edits.
export async function loadOrSeedAccounts(client, userId) {
  if (!client || !userId) throw new Error('Authenticated client and user ID required');
  const table = client.from('budget_accounts');
  const initial = await table.select('id,name,included').eq('user_id', userId);
  if (initial.error) throw initial.error;
  if (initial.data?.length) return normalizeAccounts(initial.data);
  const seed = LEGACY_ACCOUNTS.map(account => ({ ...account, user_id: userId }));
  // Upsert with ignoreDuplicates protects against concurrent first loads.
  const inserted = await table.upsert(seed, { onConflict: 'user_id,id', ignoreDuplicates: true });
  if (inserted.error) throw inserted.error;
  const final = await table.select('id,name,included').eq('user_id', userId);
  if (final.error) throw final.error;
  return normalizeAccounts(final.data ?? []);
}

// Phase 1 intentionally does not rewrite legacy year documents. Their CPM/USAA
// fields remain readable by the deployed UI until the account-aware UI lands.

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
  if (accounts.length <= 1) throw new Error('Keep at least one account');
  if (!canRemoveAccount(id, years)) throw new Error('Reassign existing budget entries and recurring rules before removing this account');
  const { data, error } = await client.from('budget_accounts').delete().eq('user_id', userId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Account removal was not saved');
}
