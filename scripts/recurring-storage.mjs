import { collectLegacyRecurringRules } from './recurring-foundation.mjs';

// The caller must obtain expectedYears from an authoritative, complete year listing.
// No migration occurs without an explicit manifest; a partial listing must not be
// marked complete. All validation finishes before the first database write.
export async function migrateRecurringRules(client, userId, years, manifest) {
  if (!client || !userId) throw new Error('Authenticated client and user ID required');
  if (!years || typeof years !== 'object' || Array.isArray(years)) throw new Error('Complete year documents required');
  if (!manifest || manifest.complete !== true || !Array.isArray(manifest.expectedYears)) {
    throw new Error('Verified complete year manifest required');
  }
  const expected = manifest.expectedYears.map(String).sort();
  const actual = Object.keys(years).sort();
  if (new Set(expected).size !== expected.length || expected.length !== actual.length ||
      expected.some((year, i) => year !== actual[i])) {
    throw new Error('Incomplete or mismatched year history');
  }
  const candidates = collectLegacyRecurringRules(years);
  if (!candidates.length) return { discovered: 0 };
  const rows = candidates.map(({ sourceRuleId, sourceYear, startDate, endDate, accountId, ...rule }) => ({
    user_id: userId, ...rule, source_year: sourceYear, source_rule_id: sourceRuleId,
    start_date: startDate, end_date: endDate, account_id: accountId
  }));
  const { error } = await client.from('budget_recurring_rules').upsert(rows, {
    onConflict: 'user_id,id', ignoreDuplicates: true
  });
  if (error) throw error;
  return { discovered: rows.length };
}
