import { previewRecurringYear } from './recurring-budget-preview.mjs';
import { normalizeRecurringRule } from './recurring-foundation.mjs';
import { writeBudgetRevision } from './budget-revision.mjs';

// Load owner-scoped rules; legacy imports are excluded from active scheduling.
export async function loadRecurringPreviewRules(client, userId) {
  if (!client || !userId) throw new Error('Authenticated recurring preview requires a user');
  const { data, error } = await client.from('budget_recurring_rules')
    .select('id,name,category,amount,due,due_day,account_id,frequency,start_date,end_date,active,versions,source_year')
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
      dueDay: row.due_day ?? row.due, accountId: row.account_id, frequency: row.frequency,
      startDate: row.start_date, endDate: row.end_date, active: row.active,
      versions: row.versions
    };
    normalizeRecurringRule(rule);
    if (!Array.isArray(rule.versions) || !rule.versions.length) {
      throw new Error('Recurring rule versions missing');
    }
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7) + '-01';
    const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
      .toISOString().slice(0, 10);
    const versions = rule.versions.slice().sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    const displayVersion = versions.filter(version => version.effectiveFrom <= currentMonth).at(-1) || versions[0];
    const upcomingMonth = nextMonth > rule.startDate.slice(0, 7) + '-01'
      ? nextMonth : rule.startDate.slice(0, 7) + '-01';
    const upcomingVersion = versions.filter(version => version.effectiveFrom <= upcomingMonth).at(-1) || versions[0];
    rule.displayActive = row.active !== false && displayVersion?.enabled !== false;
    rule.displayAmount = displayVersion?.amount ?? rule.amount;
    rule.displayFrequency = displayVersion?.frequency ?? rule.frequency;
    rule.upcomingActive = row.active !== false && upcomingVersion?.enabled !== false;
    rule.upcomingAmount = upcomingVersion?.amount ?? rule.amount;
    rule.upcomingFrequency = upcomingVersion?.frequency ?? rule.frequency;
    rule.upcomingEffectiveFrom = upcomingMonth;
    rules.push(rule);
  }
  return { rules, held };
}

export function previewLoadedRecurringYear(yearDocument, year, loaded, options = {}) {
  if (!loaded || !Array.isArray(loaded.rules)) throw new Error('Loaded rules required');
  return { ...previewRecurringYear(yearDocument, Number(year), loaded.rules, options), held: loaded.held };
}

export async function createRecurringRule(client, userId, input) {
  if (!client || !userId) throw new Error('Authenticated recurring rule write requires a user');
  const rule = normalizeRecurringRule(input);
  const row = {
    user_id: userId, id: rule.id, name: rule.name, category: rule.category,
    amount: rule.amount, due_day: rule.dueDay, account_id: rule.accountId,
    frequency: rule.frequency, start_date: rule.startDate, end_date: rule.endDate,
    active: rule.active, versions: rule.versions, source_year: null, source_rule_id: null
  };
  const { error } = await client.from('budget_recurring_rules').insert(row);
  if (error) throw error;
  return rule;
}

export async function editRecurringRule(client, userId, id, changes, effectiveFrom) {
  if (!client || !userId || !id || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(effectiveFrom)) {
    throw new Error('Authenticated effective-dated rule edit required');
  }
  const { data: rows, error: readError } = await client.from('budget_recurring_rules')
    .select('id,name,category,amount,due,due_day,account_id,frequency,start_date,end_date,active,versions')
    .eq('user_id', userId).eq('id', id);
  if (readError) throw readError;
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Recurring rule not found');
  const row = rows[0];
  if (effectiveFrom < row.start_date.slice(0, 7) + '-01') throw new Error('Effective month precedes rule start');
  let versions = structuredClone(row.versions);
  if (!Array.isArray(versions) || !versions.length) throw new Error('Recurring rule versions missing');
  // Legacy rows with active=false would remain disabled forever if only the
  // effective-dated version were enabled. Preserve their disabled history.
  const reactivateLegacy = changes.enabled === true && row.active === false;
  if (reactivateLegacy) versions = versions.map(version => ({ ...version, enabled: false }));
  const current = versions.filter(version => version.effectiveFrom <= effectiveFrom)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
  if (!current) throw new Error('No applicable recurring version');
  const next = { ...current, ...changes, effectiveFrom };
  normalizeRecurringRule({
    id, name: next.name, category: row.category, amount: next.amount,
    dueDay: next.dueDay ?? next.due ?? row.due_day ?? row.due,
    accountId: next.accountId, frequency: next.frequency,
    startDate: effectiveFrom
  });
  const updated = [...versions.filter(version => version.effectiveFrom !== effectiveFrom), next]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let mutation = client.from('budget_recurring_rules')
    .update(reactivateLegacy ? { versions: updated, active: true } : { versions: updated })
    .eq('user_id', userId).eq('id', id).eq('versions', JSON.stringify(row.versions));
  if (reactivateLegacy) mutation = mutation.eq('active', false);
  const { data: written, error: writeError } = await mutation.select('id');
  if (writeError) throw writeError;
  if (!Array.isArray(written) || written.length !== 1) throw new Error('Recurring rule changed on another device; reload before editing');
  return updated;
}

export async function setRecurringRuleActive(client, userId, id, active, effectiveFrom = new Date().toISOString().slice(0, 7) + '-01') {
  return editRecurringRule(client, userId, id, { enabled: Boolean(active) }, effectiveFrom);
}

export async function removeRecurringRule(client, userId, id) {
  if (!client || !userId || !id) throw new Error('Authenticated recurring rule delete required');
  const { data: rows, error: readError } = await client.from('budget_recurring_rules')
    .select('id,versions').eq('user_id', userId).eq('id', id);
  if (readError) throw readError;
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Recurring rule not found');
  const { data: deleted, error } = await client.from('budget_recurring_rules')
    .delete().eq('user_id', userId).eq('id', id)
    .eq('versions', JSON.stringify(rows[0].versions)).select('id');
  if (error) throw error;
  if (!Array.isArray(deleted) || deleted.length !== 1) {
    throw new Error('Recurring rule changed on another device; reload before deleting');
  }
}


export function selectRecurringCloudYears(rows, startDate, endDate = null) {
  if (!Array.isArray(rows) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      (endDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate))) {
    throw new Error('Valid recurring dates and cloud budget years required');
  }
  const startYear = Number(startDate.slice(0, 4));
  const endYear = endDate ? Number(endDate.slice(0, 4)) : 2200;
  return [...new Set(rows.filter(row => Number.isInteger(row?.year) &&
    row.year >= 1900 && row.year <= 2200 && row.year >= startYear && row.year <= endYear)
    .map(row => String(row.year)))].sort();
}

function sameRecurringRevision(known, cloud) {
  if (typeof known !== 'string' || typeof cloud !== 'string') return false;
  if (known === cloud) return true;
  // PostgREST may return a timestamptz with a numeric timezone offset and
  // microseconds while browser-written revisions use ISO Z and milliseconds.
  // Preserve full fractional precision; distinct concurrent revisions must
  // never be treated as equal merely because Date.parse truncates fractions.
  const revisionNanos = value => {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
    if (!match) return null;
    const milliseconds = Date.parse(match[1] + match[3]);
    if (!Number.isFinite(milliseconds)) return null;
    return BigInt(milliseconds) * 1000000n + BigInt((match[2] || '').padEnd(9, '0'));
  };
  const left = revisionNanos(known), right = revisionNanos(cloud);
  return left !== null && left === right;
}

function sameRecurringBudgetData(left, right) {
  // PostgreSQL jsonb intentionally does not retain object-key ordering.
  // Compare canonical JSON content while preserving array order and values.
  const canonical = value => JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]))
      : entry
  );
  return canonical(left) === canonical(right);
}

export function requireRecurringCloudSnapshot({ owner, activeOwner, cloudRow, knownRevision,
  inMemoryBudget, cachedBudget, hasLocalCache = false, conflicted = false }) {
  if (!owner || activeOwner !== owner) throw new Error('Recurring sync owner changed');
  if (conflicted) throw new Error('Unsynced local changes require reconciliation');
  if (!cloudRow || !sameRecurringRevision(knownRevision, cloudRow.updated_at) || !cloudRow.budget_data) {
    throw new Error('Cloud budget revision is unverified or stale');
  }
  if (!inMemoryBudget || !sameRecurringBudgetData(inMemoryBudget, cloudRow.budget_data) ||
      (hasLocalCache && (!cachedBudget || !sameRecurringBudgetData(cachedBudget, cloudRow.budget_data)))) {
    throw new Error('Local budget differs from cloud; reconcile before recurring sync');
  }
  return true;
}

export async function commitRecurringYear(client, userId, year, buildPreview, options = {}) {
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
  if (options.expectedUpdatedAt && !sameRecurringRevision(source.updated_at, options.expectedUpdatedAt)) {
    throw new Error('Cloud budget changed since recurring synchronization was checked');
  }
  const preview = buildPreview(source.budget_data);
  if (!preview?.document || !Number.isInteger(preview.added)) throw new Error('Invalid recurring preview');
  if (!preview.added) return { ...preview, saved: false };
  if (options.canCommit && options.canCommit() !== true) {
    throw new Error('Recurring synchronization was cancelled because local state changed');
  }
  const write = await writeBudgetRevision(client, {
    owner: userId, year, document: preview.document,
    knownRevision: source.updated_at, requestedAt: new Date().toISOString()
  });
  const updatedAt = write.updatedAt;
  return { ...preview, saved: true, updatedAt };
}


// Automatically backfill owner-scoped recurring occurrences from authoritative cloud data.
// Ambiguous historical matches are skipped, never silently duplicated or overwritten.
// The conditional cloud commit preserves concurrent budget edits.
export async function backfillRecurringYear(client, userId, year, options = {}) {
  if (!client || !userId || !Number.isInteger(Number(year))) {
    throw new Error('Authenticated recurring backfill requires a year');
  }
  const loaded = await loadRecurringPreviewRules(client, userId);
  if (!loaded.rules.length) return { added: 0, saved: false, ambiguous: [], held: loaded.held };
  return commitRecurringYear(client, userId, year,
    document => previewLoadedRecurringYear(document, year, loaded), options);
}
