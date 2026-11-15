// Read-only preflight for legacy recurring rule history.
// Repeated identifiers are intentionally NOT merged without user-confirmed mapping.
const stableId = value => (typeof value === 'string' && value.trim())
  ? value.trim()
  : (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    ? String(value) : null;

export function inspectRecurringHistory(years, manifest) {
  if (!years || typeof years !== 'object' || Array.isArray(years) ||
      !manifest || manifest.complete !== true || !Array.isArray(manifest.expectedYears)) {
    throw new Error('Verified complete year manifest required');
  }
  const expected = manifest.expectedYears.map(String).sort();
  const actual = Object.keys(years).sort();
  if (new Set(expected).size !== expected.length || expected.length !== actual.length ||
      expected.some((year, i) => year !== actual[i])) {
    throw new Error('Incomplete or mismatched year history');
  }
  const seen = new Map();
  const issues = [];
  let ruleCount = 0;
  for (const year of actual) {
    const rules = years[year]?.recurringRules;
    if (!Array.isArray(rules)) {
      issues.push({ type: 'missing-rules', year });
      continue;
    }
    const withinYear = new Set();
    for (const [index, rule] of rules.entries()) {
      ruleCount++;
      const id = stableId(rule?.id);
      if (id === null) {
        issues.push({ type: 'missing-id', year, index });
        continue;
      }
      if (typeof rule.id === 'number') issues.push({ type: 'numeric-id-requires-normalization', year, id });
      if (withinYear.has(id)) issues.push({ type: 'duplicate-in-year', year, id });
      withinYear.add(id);
      const previous = seen.get(id);
      if (previous && previous !== year) issues.push({ type: 'reused-across-years', id, years: [previous, year] });
      else seen.set(id, year);
    }
  }
  return {
    ready: issues.length === 0,
    years: actual,
    ruleCount,
    issues,
    // No occurrence generation or migration when legacy identities are ambiguous.
    blockedRuleIds: [...new Set(issues.filter(issue => issue.id).map(issue => issue.id))].sort()
  };
}
