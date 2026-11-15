// Pure plan-copying rules. No UI, cloud writes, or recurring scheduling.
const ENTRY_FIELDS = {
  income: ['name', 'amount', 'accountId'],
  fixed: ['name', 'due', 'amount', 'accountId'],
  variable: ['name', 'due', 'amount', 'accountId'],
  creditCards: ['name', 'due', 'payment', 'apr', 'accountId'],
  loans: ['name', 'due', 'payment', 'apr', 'accountId']
};
const ENTRY_TYPES = Object.keys(ENTRY_FIELDS);

function assertYear(year, label) {
  if (!year || !Array.isArray(year.months) || year.months.length !== 12) {
    throw new TypeError(label + ' must contain twelve months');
  }
  for (const month of year.months) {
    if (!month || ENTRY_TYPES.some(type => !Array.isArray(month[type]))) {
      throw new TypeError(label + ' contains invalid month entries');
    }
  }
}

function plannedEntry(entry, type) {
  if (!entry || typeof entry !== 'object' || entry.occurrenceId || entry.recurringRuleId ||
      entry.scheduledMonth) return null;
  const result = {};
  for (const field of ENTRY_FIELDS[type]) {
    if (Object.hasOwn(entry, field)) result[field] = structuredClone(entry[field]);
  }
  // A previous year's debt position and statement are historical, not a new plan.
  if (type === 'loans') result.balance = 0;
  if (type === 'creditCards') result.statement = 0;
  return result;
}

export function isEmptyYearPlan(year) {
  assertYear(year, 'Target year');
  return year.months.every(month => ENTRY_TYPES.every(type => month[type].length === 0));
}

export function copyPreviousYearPlan(source, target) {
  assertYear(source, 'Source year');
  assertYear(target, 'Target year');
  if (!isEmptyYearPlan(target)) throw new Error('Target year already contains entries');
  // Keep target opening balances, auto-cascade settings and unrelated metadata.
  const result = structuredClone(target);
  result.months = target.months.map((month, index) => {
    const from = source.months[index];
    const next = structuredClone(month);
    for (const type of ENTRY_TYPES) {
      next[type] = from[type].map(entry => plannedEntry(entry, type)).filter(Boolean);
    }
    return next;
  });
  return result;
}
