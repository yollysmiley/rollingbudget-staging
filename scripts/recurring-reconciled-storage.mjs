import { collectLegacyRecurringRules } from './recurring-foundation.mjs';
import { planRecurringIdentityMigration } from './recurring-identity-plan.mjs';

// Safe, opt-in bridge from reviewed legacy identities to the owner-scoped table.
// No cross-year merge is permitted: an ambiguous identity must be split first.
// The source year and original source ID remain available for audit/retries.
export async function migrateReconciledRecurringRules(client, userId, years, manifest, decisions) {
  if (!client || typeof client.from !== 'function' || !userId) {
    throw new Error('Authenticated client and user ID required');
  }
  const plan = planRecurringIdentityMigration(years, manifest, decisions);
  if (!plan.ready) {
    const error = new Error('Unresolved recurring history; migration blocked');
    error.issues = plan.unresolved;
    throw error;
  }
  const rows = [];
  for (const group of plan.groups) {
    if (group.sources.length !== 1) throw new Error('Cross-year merging is not supported');
    const source = group.sources[0];
    const legacy = years[source.year].recurringRules[source.index];
    // Normalize a copy. Numeric source IDs are converted only for validation;
    // the source documents and original historical transactions are untouched.
    const normalized = collectLegacyRecurringRules({
      [source.year]: { recurringRules: [{ ...legacy, id: source.sourceId }] }
    })[0];
    rows.push({
      user_id: userId,
      id: group.identity,
      name: normalized.name,
      category: normalized.category,
      amount: normalized.amount,
      due: normalized.due,
      account_id: normalized.accountId,
      frequency: normalized.frequency,
      start_date: normalized.startDate,
      end_date: normalized.endDate,
      active: normalized.active,
      versions: normalized.versions,
      source_year: normalized.sourceYear,
      source_rule_id: normalized.sourceRuleId
    });
  }
  if (!rows.length) return { discovered: 0, written: 0 };
  // ignoreDuplicates preserves existing rule definitions on retries.
  const { error } = await client.from('budget_recurring_rules').upsert(rows, {
    onConflict: 'user_id,id', ignoreDuplicates: true
  });
  if (error) throw error;
  return { discovered: rows.length, written: rows.length };
}
