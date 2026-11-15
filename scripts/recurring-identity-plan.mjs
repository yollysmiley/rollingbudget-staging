import { inspectRecurringHistory } from './recurring-reconciliation.mjs';

// An explicit map is required for every ambiguous cross-year identity.
// This produces a migration preview only; it never modifies historical documents.
export function planRecurringIdentityMigration(years, manifest, decisions = {}) {
  const report = inspectRecurringHistory(years, manifest);
  if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) {
    throw new Error('Explicit reconciliation decisions required');
  }
  const groups = new Map();
  const unresolved = [...report.issues.filter(issue =>
    issue.type === 'missing-id' || issue.type === 'missing-rules' || issue.type === 'duplicate-in-year')];
  for (const year of report.years) {
    for (const [index, rule] of (years[year].recurringRules ?? []).entries()) {
      if (typeof rule?.id !== 'string' && typeof rule?.id !== 'number') continue;
      const sourceId = String(rule.id).trim();
      if (!sourceId || (typeof rule.id === 'number' && (!Number.isSafeInteger(rule.id) || rule.id < 0))) continue;
      const sourceKey = JSON.stringify([year, sourceId]);
      const choice = decisions[sourceKey];
      if (typeof choice !== 'string' || !choice.trim() || choice.length > 256) {
        unresolved.push({ type: 'decision-required', year, index, id: sourceId, sourceKey });
        continue;
      }
      const identity = choice.trim();
      if (!groups.has(identity)) groups.set(identity, []);
      groups.get(identity).push({ year, index, sourceId, sourceKey });
    }
  }
  // One rule per year may map to a shared identity. This does not assert
  // that distinct definitions are semantically equivalent.
  for (const [identity, sources] of groups) {
    if (new Set(sources.map(source => source.year)).size !== sources.length) {
      unresolved.push({ type: 'same-year-identity-collision', identity });
    }
    if (sources.length > 1) {
      unresolved.push({ type: 'cross-year-definition-review', identity, sources });
    }
  }
  return {
    ready: unresolved.length === 0,
    unresolved,
    groups: [...groups].map(([identity, sources]) => ({ identity, sources })),
    historicalDocumentsUnchanged: true
  };
}
