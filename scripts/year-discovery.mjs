// Year availability is a view over a rolling calendar window and owned records.
// Discovering a year never writes an empty budget to the cloud.
export function isBudgetYear(value) {
  const text = String(value);
  return /^\d{4}$/.test(text) && Number(text) >= 1900 && Number(text) <= 2200;
}

export function rollingBudgetYears(currentYear = new Date().getFullYear()) {
  if (!Number.isInteger(Number(currentYear)) || !isBudgetYear(currentYear)) {
    throw new Error('Invalid current budget year');
  }
  return [0, 1, 2].map(offset => String(Number(currentYear) + offset)).filter(isBudgetYear);
}

export function localBudgetYears(keys, ownedPrefix) {
  if (!ownedPrefix) return [];
  return keys.flatMap(key => {
    if (!key.startsWith(ownedPrefix)) return [];
    const match = /^(\d{4})(?:_cloud_conflict)?$/.exec(key.slice(ownedPrefix.length));
    return match && isBudgetYear(match[1]) ? [match[1]] : [];
  });
}

export function availableBudgetYears(currentYear, cloudYears, keys, ownedPrefix) {
  const years = [...rollingBudgetYears(currentYear), ...cloudYears.map(String), ...localBudgetYears(keys, ownedPrefix)];
  return [...new Set(years.filter(isBudgetYear))].sort((a, b) => Number(a) - Number(b));
}

// Supabase jsonb may reorder object keys without changing financial content.
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function sameBudgetDocument(left, right) {
  return canonical(left) === canonical(right);
}
