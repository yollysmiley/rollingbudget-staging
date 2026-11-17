import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commitRecurringYear } from '../scripts/recurring-app-service.mjs';

const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
function section(start, end) {
  const from = html.indexOf(start), to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'Recovery path must exist');
  return html.slice(from, to);
}

test('reconciliation records committed revision before checking local state and writing cache', () => {
  const source = section('async function reconcileCloudBudget(useLocal)', 'async function saveDB(');
  const write = source.indexOf('await writeBudgetRevision(');
  const revision = source.indexOf('cloudBudgetVersions.set(key, nextTimestamp)', write);
  const check = source.indexOf('assertUnchanged();', write);
  const cache = source.indexOf('localStorage.setItem(budgetKey, JSON.stringify({ data: normalizedLocal', write);
  assert.ok(write >= 0 && revision > write && check > revision && cache > check);
  assert.match(source, /localStorage\.setItem\(budgetKey \+ '_conflict_backup'/);
  assert.match(source, /catch \(error\) \{[\s\S]*?Local changes and backups were preserved/);
  assert.match(source, /localStorage\.getItem\(markerKey\) === '1'/);
  assert.ok(!source.includes('clearCloudConflict(key, year);\n    });\n  } catch'),
    'Failure handling must not clear the unresolved conflict marker');
});

test('recurring post-commit owner guard precedes local cache writes and retains conflict on failure', () => {
  const source = section('async function backfillSavedRecurringYears(', 'async function addRecurringRule(');
  const commit = source.indexOf('await recurringAppService.backfillRecurringYear(');
  const saved = source.indexOf('cloudCommitted = Boolean(result.saved)', commit);
  const guard = source.indexOf('if (currentUser?.id !== owner) return;', saved);
  const cache = source.indexOf('localStorage.setItem(storageKey(year), JSON.stringify({', saved);
  assert.ok(commit >= 0 && saved > commit && guard > saved && cache > guard);
  assert.match(source, /if \(cloudCommitted \|\|[\s\S]*?markCloudConflict\(key, year\)/);
});

test('in-flight recurring CAS remains scoped to original owner after account switch', async () => {
  const original = { months: [{ fixed: [] }] };
  let releaseWrite, scope, activeOwner = 'owner-a';
  const client = { from(table) {
    assert.equal(table, 'budget_ui_years');
    return {
      select() { return { eq() { return { async eq() {
        return { data: [{ year: 2027, budget_data: original,
          updated_at: '2026-11-16T00:00:00.000Z' }], error: null };
      } }; } }; },
      update(document) {
        const filters = {};
        const q = { eq(field, value) { filters[field] = value; return q; },
          select() { scope = { filters, document }; return new Promise(resolve => { releaseWrite = resolve; }); } };
        return q;
      }
    };
  } };
  const pending = commitRecurringYear(client, 'owner-a', 2027, document => ({
    document: { ...document, months: [{ fixed: [{ name: 'Scheduled', amount: 40 }] }] },
    added: 1
  }), { canCommit: () => activeOwner === 'owner-a' });
  for (let i = 0; i < 10 && !releaseWrite; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof releaseWrite, 'function');
  activeOwner = 'owner-b';
  releaseWrite({ data: [{ year: 2027 }], error: null });
  const result = await pending;
  assert.equal(result.saved, true);
  assert.equal(scope.filters.user_id, 'owner-a');
  assert.equal(scope.filters.year, 2027);
  assert.equal(scope.filters.updated_at, '2026-11-16T00:00:00.000Z');
  assert.equal(original.months[0].fixed.length, 0);
  assert.equal(result.document.months[0].fixed[0].amount, 40);
});
