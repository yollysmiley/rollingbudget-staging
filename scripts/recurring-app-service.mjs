import { previewRecurringYear } from './recurring-budget-preview.mjs';
import { normalizeRecurringRule } from './recurring-foundation.mjs';

// Read-only bridge. Historical imports are excluded until identity reconciliation
// is approved; no generated transactions are saved to year documents.
export async function loadRecurringPreviewRules(client, userId) {
  if (!client || !userId) throw new Error('Authenticated recurring preview requires a user');
  const { data, error } = await client.from('budget_recurring_rules')
    .select('id,name,category,amount,due,account_id,frequency,start_date,end_date,active,versions,source_year')
    .eq('user_id', userId);
  if (error) throw error;
  const rules = [];
  let held = 0;
  for (const row of data ?? []) {
    if (row.source_year !== null && row.source_year !== undefined) {
      held++;
      continue;
    }
    const rule = {
      id: row.id, name: row.name, category: row.category, amount: Number(row.amount),
      due: row.due, accountId: row.account_id, frequency: row.frequency,
      startDate: row.start_date, endDate: row.end_date, active: row.active,
      versions: row.versions
    };
    normalizeRecurringRule(rule);
    if (!Array.isArray(rule.versions) || !rule.versions.length) {
      throw new Error('Recurring rule versions missing');
    }
    rules.push(rule);
  }
  return { rules, held };
}

export function previewLoadedRecurringYear(yearDocument, year, loaded) {
  if (!loaded || !Array.isArray(loaded.rules)) throw new Error('Loaded rules required');
  return { ...previewRecurringYear(yearDocument, Number(year), loaded.rules), held: loaded.held };
}
