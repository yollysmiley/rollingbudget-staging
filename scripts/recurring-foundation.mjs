// Phase 4A: pure, non-destructive normalization of historical year-scoped rules.
// Scheduling and the UI switch to user-level rules are reserved for later phases.
export const FREQUENCY_MONTHS = Object.freeze({
  monthly: 1, 'every-2-months': 2, quarterly: 3,
  'every-6-months': 6, annually: 12
});

export function normalizeRecurringRule(rule) {
  if (!rule || typeof rule !== 'object') throw new TypeError('Rule required');
  const startDate = String(rule.startDate ?? '');
  if (!/^\\d{4}-(0[1-9]|1[0-2])-01$/.test(startDate)) throw new Error('Start date must be the first day of a calendar month');
  const frequency = rule.frequency || 'monthly';
  if (!FREQUENCY_MONTHS[frequency]) throw new Error('Unsupported recurring frequency');
  const amount = Number(rule.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid recurring amount');
  const name = String(rule.name ?? '').trim();
  if (!name) throw new Error('Rule name required');
  const endDate = rule.endDate ?? null;
  if (endDate !== null && (!/^\\d{4}-(0[1-9]|1[0-2])-01$/.test(endDate) || endDate < startDate)) throw new Error('Invalid end date');
  return {
    id: String(rule.id), name, category: rule.category,
    amount, due: String(rule.due ?? ''), accountId: rule.accountId || null,
    frequency, startDate, endDate, active: rule.active !== false,
    versions: [{ effectiveFrom: startDate, name, amount, due: String(rule.due ?? ''), accountId: rule.accountId || null, frequency }]
  };
}

export function collectLegacyRecurringRules(years) {
  const rules = [];
  const seen = new Set();
  for (const [year, document] of Object.entries(years ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    if (!/^\\d{4}$/.test(year)) continue;
    for (const [index, legacy] of (document?.recurringRules ?? []).entries()) {
      const month = legacy.startMonth ?? legacy.start ?? 0;
      if (!Number.isInteger(month) || month < 0 || month > 11) throw new Error('Invalid historical rule start month');
      const sourceId = String(legacy.id ?? index);
      const key = year + ':' + sourceId;
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push({
        ...normalizeRecurringRule({
          id: 'legacy-' + year + '-' + encodeURIComponent(sourceId),
          name: legacy.name, category: legacy.cat, amount: legacy.amount,
          due: legacy.due, accountId: legacy.accountId || legacy.acct,
          frequency: legacy.frequency || 'monthly',
          startDate: year + '-' + String(month + 1).padStart(2, '0') + '-01',
          active: legacy.active
        }),
        sourceYear: Number(year), sourceRuleId: sourceId
      });
    }
  }
  return rules;
}
