import { LEGACY_ACCOUNTS, normalizeAccounts } from './account-model.mjs';

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
