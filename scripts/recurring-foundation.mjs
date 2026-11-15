// Phase 4A: validate historical definitions without changing year documents.
// Reconciliation is explicit: never guess that two year-scoped rules are the same.
export const FREQUENCY_MONTHS = Object.freeze({
  monthly: 1, 'every-2-months': 2, quarterly: 3,
  'every-6-months': 6, annually: 12
});
const CATEGORIES = new Set(['income', 'fixed', 'variable', 'loan', 'cc']);
const DATE_PATTERN = /^\\d{4}-(0[1-9]|1[0-2])-01$/;

function validMonthDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month] = value.split('-').map(Number);
  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12;
}

export function normalizeRecurringRule(rule) {
  if (!rule || typeof rule !== 'object') throw new TypeError('Rule required');
  const id = typeof rule.id === 'string' ? rule.id.trim() : '';
  if (!id || id.length > 256) throw new Error('Stable rule identifier required');
  const startDate = rule.startDate;
  if (!validMonthDate(startDate)) throw new Error('Invalid start date');
  const endDate = rule.endDate ?? null;
  if (endDate !== null && (!validMonthDate(endDate) || endDate < startDate)) throw new Error('Invalid end date');
  const frequency = rule.frequency ?? 'monthly';
  if (!Object.hasOwn(FREQUENCY_MONTHS, frequency)) throw new Error('Unsupported recurring frequency');
  const category = rule.category;
  if (!CATEGORIES.has(category)) throw new Error('Unsupported recurring category');
  const amount = rule.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('Invalid recurring amount');
  const name = typeof rule.name === 'string' ? rule.name.trim() : '';
  if (!name) throw new Error('Rule name required');
  const due = String(rule.due ?? '');
  const accountId = rule.accountId || null;
  return {
    id, name, category, amount, due, accountId,
    frequency, startDate, endDate, active: rule.active !== false,
    versions: [{ effectiveFrom: startDate, name, amount, due, accountId, frequency }]
  };
}

export function collectLegacyRecurringRules(years, options = {}) {
  const rules = [];
  const idsByYear = new Set();
  const appearances = new Map();
  const reconciled = options.reconciliation ?? {};
  const mapped = new Set();
  for (const [year, document] of Object.entries(years ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    if (!/^\\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2200) throw new Error('Invalid budget year');
    if (!Array.isArray(document?.recurringRules)) throw new Error('Missing recurring rules for year ' + year);
    for (const legacy of document.recurringRules) {
      const sourceId = typeof legacy?.id === 'string' ? legacy.id.trim() : '';
      if (!sourceId) throw new Error('Stable legacy rule ID required for year ' + year + '; resolve ID before migration');
      const sourceKey = year + ':' + sourceId;
      if (idsByYear.has(sourceKey)) throw new Error('Duplicate legacy rule ID in year ' + year);
      idsByYear.add(sourceKey);
      const month = legacy.startMonth ?? legacy.start ?? 0;
      if (!Number.isInteger(month) || month < 0 || month > 11) throw new Error('Invalid historical rule start month');
      const target = reconciled[sourceKey];
      if (target !== undefined) {
        if (typeof target !== 'string' || !target.trim()) throw new Error('Invalid reconciliation target');
        mapped.add(sourceKey);
      }
      const identity = target || sourceKey;
      if (appearances.has(identity)) {
        // A continuing rule needs an explicit version/effective-date merge strategy.
        // Blocking is safer than importing duplicate or conflicting commitments.
        throw new Error('Multiple historical rules map to ' + identity + '; reconcile versions before migration');
      }
      appearances.set(identity, sourceKey);
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
  // Reused source IDs across years are ambiguous. They must be reconciled
  // before scheduling is enabled, rather than silently importing both.
  const byId = new Map();
  for (const rule of rules) {
    const existing = byId.get(rule.sourceRuleId);
    if (existing && !mapped.has(existing.sourceYear + ':' + existing.sourceRuleId) && !mapped.has(rule.sourceYear + ':' + rule.sourceRuleId)) {
      throw new Error('Recurring rule ID appears in multiple years: ' + rule.sourceRuleId + '; explicit reconciliation required');
    }
    byId.set(rule.sourceRuleId, rule);
  }
  return rules;
}
