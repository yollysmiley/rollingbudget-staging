import { FREQUENCY_MONTHS, normalizeRecurringRule } from './recurring-foundation.mjs';

// Pure calendar arithmetic; never use local timezone or mutate source documents.
const monthNumber = date => {
  const [year, month] = date.split('-').map(Number);
  return year * 12 + month - 1;
};
const monthDate = index =>
  String(Math.floor(index / 12)).padStart(4, '0') + '-' + String(index % 12 + 1).padStart(2, '0') + '-01';

function versionsFor(rule) {
  const versions = rule.versions ?? [];
  if (!Array.isArray(versions) || !versions.length) throw new Error('Rule versions required');
  const sorted = versions.map(version => {
    const normalized = normalizeRecurringRule({
      ...rule, ...version, id: rule.id,
      startDate: version.effectiveFrom, endDate: null,
      category: rule.category
    });
    return { ...normalized.versions[0], effectiveFrom: version.effectiveFrom };
  }).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (sorted[0].effectiveFrom !== rule.startDate) throw new Error('Initial version must match start date');
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].effectiveFrom === sorted[i - 1].effectiveFrom) throw new Error('Duplicate effective date');
  }
  return sorted;
}

export function scheduledOccurrences(rule, year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error('Invalid schedule year');
  const normalized = normalizeRecurringRule(rule);
  if (!normalized.active) return [];
  const versions = versionsFor(rule);
  const start = monthNumber(normalized.startDate);
  const end = normalized.endDate ? monthNumber(normalized.endDate) : Infinity;
  const first = Math.max(start, year * 12);
  const last = Math.min(end, year * 12 + 11);
  const results = [];
  for (let month = first; month <= last; month++) {
    const date = monthDate(month);
    const version = versions.filter(v => v.effectiveFrom <= date).at(-1);
    // Frequency remains anchored to the original start month, even when edited.
    const interval = FREQUENCY_MONTHS[version.frequency];
    if ((month - start) % interval !== 0) continue;
    results.push({
      occurrenceId: JSON.stringify([normalized.id, date]),
      recurringRuleId: normalized.id,
      scheduledMonth: date,
      category: normalized.category,
      name: version.name,
      amount: version.amount,
      due: version.due,
      accountId: version.accountId,
    });
  }
  return results;
}

// Only append missing occurrences. Never update/delete existing manual or historical entries.
export function appendMissingOccurrences(existing, occurrences, { blockedRuleIds = [] } = {}) {
  if (!Array.isArray(existing) || !Array.isArray(occurrences)) throw new TypeError('Entries required');
  const blocked = new Set(blockedRuleIds);
  const ids = new Set(existing.map(entry => entry.occurrenceId).filter(Boolean));
  const appended = [];
  for (const occurrence of occurrences) {
    if (blocked.has(occurrence.recurringRuleId) || ids.has(occurrence.occurrenceId)) continue;
    ids.add(occurrence.occurrenceId);
    appended.push({ ...occurrence });
  }
  return [...existing, ...appended];
}
