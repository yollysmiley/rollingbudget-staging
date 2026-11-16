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

function isGeneratedEntry(entry) {
  return Boolean(entry?.occurrenceId || entry?.recurringRuleId || entry?.scheduledMonth);
}

// A year with generated recurring occurrences but no manual entries is still
// eligible for a one-time plan copy. Generated entries are never replaced.
export function isEmptyYearPlan(year) {
  assertYear(year, 'Target year');
  return year.months.every(month => ENTRY_TYPES.every(type =>
    month[type].every(isGeneratedEntry)));
}

function sameGeneratedPlan(entry, generated, type) {
  if (!isGeneratedEntry(generated)) return false;
  // Only suppress an exact matching scheduled entry. Different amounts or
  // account assignments may be intentional separate manual transactions.
  return ENTRY_FIELDS[type].every(field => {
    const left = entry[field], right = generated[field];
    if (['amount', 'payment', 'apr'].includes(field)) return Number(left ?? 0) === Number(right ?? 0);
    if (field === 'name' || field === 'due') {
      return String(left ?? '').trim().toLocaleLowerCase() ===
        String(right ?? '').trim().toLocaleLowerCase();
    }
    return (left ?? null) === (right ?? null);
  });
}

export function copyPreviousYearPlan(source, target) {
  assertYear(source, 'Source year');
  assertYear(target, 'Target year');
  if (!isEmptyYearPlan(target)) throw new Error('Target year already contains manual entries');
  // Keep target opening balances, generated occurrences, auto-cascade and metadata.
  const result = structuredClone(target);
  result.months = target.months.map((month, index) => {
    const from = source.months[index];
    const next = structuredClone(month);
    for (const type of ENTRY_TYPES) {
      for (const entry of from[type].map(item => plannedEntry(item, type)).filter(Boolean)) {
        if (!next[type].some(existing => sameGeneratedPlan(entry, existing, type))) {
          next[type].push(entry);
        }
      }
    }
    return next;
  });
  return result;
}

export function projectedJanuaryOpening(previousYear, accounts, computeBudget) {
  assertYear(previousYear, 'Previous year');
  if (!Array.isArray(accounts) || typeof computeBudget !== 'function') {
    throw new TypeError('Accounts and budget calculator required');
  }
  const months = computeBudget(previousYear, accounts);
  const december = months?.[11]?.endingRollover;
  if (typeof december !== 'number' || !Number.isFinite(december)) {
    throw new Error('December rollover could not be calculated');
  }
  return december;
}

export function canApplyJanuaryOpening(targetYear) {
  assertYear(targetYear, 'Target year');
  // A nonzero opening balance represents an existing manual choice.
  return Number(targetYear.months[0].recordedLeftover) === 0;
}
