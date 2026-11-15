import { collectLegacyRecurringRules } from './recurring-foundation.mjs';

// Explicit migration entry point; caller must first verify all year documents are loaded.
// Ignore duplicates makes retries safe. Never mutate or delete historical budget records.
export async function migrateRecurringRules(client, userId, years) {
  if (!client || !userId) throw new Error('Authenticated client and user ID required');
  if (!years || typeof years !== 'object') throw new Error('Complete year documents required');
  const candidates = collectLegacyRecurringRules(years);
  if (!candidates.length) return { discovered: 0 };
  const rows = candidates.map(({ sourceRuleId, sourceYear, startDate, endDate, accountId, ...rule }) => ({
    user_id: userId, ...rule, source_year: sourceYear, source_rule_id: sourceRuleId,
    start_date: startDate, end_date: endDate, account_id: accountId
  }));
  const { error } = await client.from('budget_recurring_rules').upsert(rows, {
    onConflict: 'user_id,source_year,source_rule_id', ignoreDuplicates: true
  });
  if (error) throw error;
  return { discovered: rows.length };
}
