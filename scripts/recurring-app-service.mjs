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

export async function createRecurringRule(client, userId, input) {
  if (!client || !userId) throw new Error('Authenticated recurring rule write requires a user');
  const rule = normalizeRecurringRule(input);
  const row = {
    user_id: userId, id: rule.id, name: rule.name, category: rule.category,
    amount: rule.amount, due: rule.due, account_id: rule.accountId,
    frequency: rule.frequency, start_date: rule.startDate, end_date: rule.endDate,
    active: rule.active, versions: rule.versions, source_year: null, source_rule_id: null
  };
  const { error } = await client.from('budget_recurring_rules').insert(row);
  if (error) throw error;
  return rule;
}

export async function setRecurringRuleActive(client, userId, id, active) {
  if (!client || !userId || !id) throw new Error('Authenticated recurring rule update required');
  const { error } = await client.from('budget_recurring_rules')
    .update({ active: Boolean(active) }).eq('user_id', userId).eq('id', id);
  if (error) throw error;
}

export async function removeRecurringRule(client, userId, id) {
  if (!client || !userId || !id) throw new Error('Authenticated recurring rule delete required');
  const { error } = await client.from('budget_recurring_rules')
    .delete().eq('user_id', userId).eq('id', id);
  if (error) throw error;
}
