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
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const currentVersion = rule.versions.filter(version => version.effectiveFrom <= currentMonth)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
    rule.active = row.active !== false && (currentVersion?.enabled !== false);
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

export async function editRecurringRule(client, userId, id, changes, effectiveFrom) {
  if (!client || !userId || !id || !/^\\d{4}-(0[1-9]|1[0-2])-01$/.test(effectiveFrom)) {
    throw new Error('Authenticated effective-dated rule edit required');
  }
  const { data: rows, error: readError } = await client.from('budget_recurring_rules')
    .select('id,name,category,amount,due,account_id,frequency,start_date,end_date,active,versions')
    .eq('user_id', userId).eq('id', id);
  if (readError) throw readError;
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Recurring rule not found');
  const row = rows[0];
  if (effectiveFrom < row.start_date) throw new Error('Effective date precedes rule start');
  const versions = structuredClone(row.versions);
  if (!Array.isArray(versions) || !versions.length) throw new Error('Recurring rule versions missing');
  const current = versions.filter(version => version.effectiveFrom <= effectiveFrom)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
  if (!current) throw new Error('No applicable recurring version');
  const next = { ...current, ...changes, effectiveFrom };
  normalizeRecurringRule({
    id, name: next.name, category: row.category, amount: next.amount,
    due: next.due, accountId: next.accountId, frequency: next.frequency,
    startDate: effectiveFrom
  });
  const updated = [...versions.filter(version => version.effectiveFrom !== effectiveFrom), next]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const { error: writeError } = await client.from('budget_recurring_rules')
    .update({ versions: updated }).eq('user_id', userId).eq('id', id);
  if (writeError) throw writeError;
  return updated;
}

export async function setRecurringRuleActive(client, userId, id, active, effectiveFrom = new Date().toISOString().slice(0, 7) + '-01') {
  return editRecurringRule(client, userId, id, { enabled: Boolean(active) }, effectiveFrom);
}

export async function removeRecurringRule(client, userId, id) {
  if (!client || !userId || !id) throw new Error('Authenticated recurring rule delete required');
  const { error } = await client.from('budget_recurring_rules')
    .delete().eq('user_id', userId).eq('id', id);
  if (error) throw error;
}

export async function commitRecurringYear(client, userId, year, buildPreview) {
  if (!client || !userId || !Number.isInteger(Number(year)) || typeof buildPreview !== 'function') {
    throw new Error('Authenticated recurring commit requires a year and preview builder');
  }
  // Read the authoritative document and conditionally update the same version.
  // Concurrent edits cannot be overwritten by a stale browser snapshot.
  const { data: rows, error: readError } = await client.from('budget_ui_years')
    .select('year,budget_data,updated_at').eq('user_id', userId).eq('year', Number(year));
  if (readError) throw readError;
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('Budget year must be cloud-saved before applying recurring entries');
  }
  const source = rows[0];
  const preview = buildPreview(source.budget_data);
  if (!preview?.document || !Number.isInteger(preview.added)) throw new Error('Invalid recurring preview');
  if (!preview.added) return { ...preview, saved: false };
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(source.updated_at) + 1)).toISOString();
  const { data: written, error: writeError } = await client.from('budget_ui_years')
    .update({ budget_data: preview.document, updated_at: updatedAt })
    .eq('user_id', userId).eq('year', Number(year)).eq('updated_at', source.updated_at)
    .select('year');
  if (writeError) throw writeError;
  if (!Array.isArray(written) || written.length !== 1) {
    throw new Error('Budget changed on another device; reload before applying recurring entries');
  }
  return { ...preview, saved: true, updatedAt };
}
