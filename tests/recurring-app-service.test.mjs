import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecurringPreviewRules, previewLoadedRecurringYear, createRecurringRule, editRecurringRule, setRecurringRuleActive, removeRecurringRule, commitRecurringYear, backfillRecurringYear, selectRecurringCloudYears, requireRecurringCloudSnapshot } from '../scripts/recurring-app-service.mjs';

const rule = { id: 'rent', name: 'Rent', category: 'fixed', amount: '500', due: '1st',
  account_id: null, frequency: 'monthly', start_date: '2026-12-01',
  end_date: null, active: true, source_year: null,
  versions: [{ effectiveFrom: '2026-12-01', name: 'Rent', amount: 500,
    due: '1st', accountId: null, frequency: 'monthly' }] };
const budget = () => ({ months: Array.from({ length: 12 }, () => ({
  income: [], fixed: [], variable: [], loans: [], creditCards: []
})) });

test('loads only authenticated owner rules and holds historical imports for review', async () => {
  const client = { from(table) {
    assert.equal(table, 'budget_recurring_rules');
    return { select(fields) {
      assert.ok(fields.includes('source_year'));
      return { eq(field, id) {
        assert.equal(field, 'user_id');
        assert.equal(id, 'user-a');
        return Promise.resolve({ data: [rule, { ...rule, id: 'legacy', source_year: 2026 }], error: null });
      } };
    } };
  } };
  const loaded = await loadRecurringPreviewRules(client, 'user-a');
  assert.equal(loaded.rules.length, 1);
  assert.equal(loaded.held, 1);
  const source = budget();
  const result = previewLoadedRecurringYear(source, '2027', loaded);
  assert.equal(result.added, 12);
  assert.equal(source.months[0].fixed.length, 0);
  assert.equal(result.document.months[0].fixed[0].amount, 500);
});

test('rejects malformed or failed loads without modifying budgets', async () => {
  await assert.rejects(() => loadRecurringPreviewRules(null, null), /Authenticated/);
  const client = { from() { return { select() { return { eq: async () => ({
    data: [{ ...rule, versions: [] }], error: null
  }) }; } }; } };
  await assert.rejects(() => loadRecurringPreviewRules(client, 'user-a'), /versions/);
  const failed = { from() { return { select() { return { eq: async () => ({
    data: null, error: new Error('offline')
  }) }; } }; } };
  await assert.rejects(() => loadRecurringPreviewRules(failed, 'user-a'), /offline/);
});

test('shared recurring rule writes are owner-scoped and never modify historical budget transactions', async () => {
  const calls = [];
  const client = { from(table) {
    assert.equal(table, 'budget_recurring_rules');
    return {
      async insert(row) { calls.push(['insert', row]); return { error: null }; },
      select() { return { eq(field, owner) {
        assert.equal(field, 'user_id'); assert.equal(owner, 'owner-a');
        return { async eq(key, id) {
          assert.equal(key, 'id'); assert.equal(id, 'new-rent');
          return { data: [{
            id, name: 'Rent', category: 'fixed', amount: 1000, due: '',
            account_id: null, frequency: 'monthly', start_date: '2027-01-01',
            end_date: null, active: true,
            versions: [{ effectiveFrom: '2027-01-01', name: 'Rent', amount: 1000,
              due: '', accountId: null, frequency: 'monthly' }]
          }], error: null };
        } };
      } }; },
      update(changes) { const filters = {}; const query = {
        eq(field, value) { filters[field] = value; return query; },
        async select() { calls.push(['update', changes, filters]); return { data: [{ id: filters.id }], error: null }; }
      }; return query; },
      delete() { const filters = {}; const chain = {
        eq(field, value) { filters[field] = value; return chain; },
        async select() { calls.push(['delete', filters]); return { data: [{ id: filters.id }], error: null }; }
      }; return chain; }
    };
  } };
  const historical = budget();
  historical.months[0].fixed.push({ name: 'Old rent', amount: 999 });
  const snapshot = structuredClone(historical);
  const created = await createRecurringRule(client, 'owner-a', {
    id: 'new-rent', name: 'Rent', category: 'fixed', amount: 1000,
    frequency: 'monthly', startDate: '2027-01-01'
  });
  assert.equal(created.id, 'new-rent');
  assert.equal(calls[0][1].user_id, 'owner-a');
  assert.equal(calls[0][1].source_year, null);
  await setRecurringRuleActive(client, 'owner-a', 'new-rent', false, '2027-03-01');
  await removeRecurringRule(client, 'owner-a', 'new-rent');
  assert.equal(calls[1][0], 'update');
  assert.equal(calls[1][1].versions[1].effectiveFrom, '2027-03-01');
  assert.equal(calls[1][1].versions[1].enabled, false);
  assert.equal(calls[1][2].user_id, 'owner-a');
  assert.equal(calls[1][2].id, 'new-rent');
  assert.equal(typeof calls[1][2].versions, 'string');
  assert.equal(calls[2][0], 'delete');
  assert.equal(calls[2][1].user_id, 'owner-a');
  assert.equal(calls[2][1].id, 'new-rent');
  assert.equal(typeof calls[2][1].versions, 'string');
  assert.deepEqual(historical, snapshot);
});

test('recurring cloud commit rejects stale revisions without modifying source budgets', async () => {
  const source = budget();
  const rows = [{ year: 2027, budget_data: source, updated_at: '2026-11-15T00:00:00.000Z' }];
  let conflicted = true;
  const client = { from(table) {
    assert.equal(table, 'budget_ui_years');
    return {
      select() { return { eq() { return { async eq() { return { data: rows, error: null }; } }; } }; },
      update(changes) {
        assert.equal(changes.budget_data.months[0].fixed.length, 1);
        return { eq() { return { eq() { return { eq(field, value) {
          assert.equal(field, 'updated_at');
          assert.equal(value, rows[0].updated_at);
          return { async select() { return { data: conflicted ? [] : [{ year: 2027 }], error: null }; } };
        } }; } }; } };
      }
    };
  } };
  const build = doc => {
    const copy = structuredClone(doc);
    copy.months[0].fixed.push({ name: 'Scheduled', amount: 10 });
    return { document: copy, added: 1, skipped: [] };
  };
  await assert.rejects(() => commitRecurringYear(client, 'owner-a', 2027, build), /changed on another device/);
  assert.equal(source.months[0].fixed.length, 0);
  conflicted = false;
  const saved = await commitRecurringYear(client, 'owner-a', 2027, build);
  assert.equal(saved.saved, true);
  assert.equal(saved.document.months[0].fixed.length, 1);
  assert.equal(source.months[0].fixed.length, 0);
});

test('concurrent rule version update is rejected without changing the source', async () => {
  const source = structuredClone(rule);
  const client = { from() { return {
    select() { return { eq() { return { async eq() { return { data: [source], error: null }; } }; } }; },
    update() { const filters = {}; const chain = {
      eq(field, value) { filters[field] = value; return chain; },
      async select() {
        assert.equal(filters.user_id, 'owner-a');
        assert.equal(filters.id, 'rent');
        assert.equal(filters.versions, JSON.stringify(source.versions));
        return { data: [], error: null };
      }
    }; return chain; }
  }; } };
  await assert.rejects(() => editRecurringRule(client, 'owner-a', 'rent',
    { amount: 600 }, '2027-01-01'), /changed on another device/);
  assert.equal(source.versions.length, 1);
  assert.equal(source.versions[0].amount, 500);
});

test('concurrent edit prevents stale owner-scoped recurring deletion', async () => {
  const initial = structuredClone(rule);
  const filters = {};
  const client = { from(table) {
    assert.equal(table, 'budget_recurring_rules');
    return {
      select() { return { eq(field, value) {
        assert.equal(field, 'user_id'); assert.equal(value, 'owner-a');
        return { async eq(key, id) { assert.equal(key, 'id'); assert.equal(id, 'rent'); return { data: [initial], error: null }; } };
      } }; },
      delete() { const chain = {
        eq(field, value) { filters[field] = value; return chain; },
        async select() { return { data: [], error: null }; }
      }; return chain; }
    };
  } };
  await assert.rejects(() => removeRecurringRule(client, 'owner-a', 'rent'),
    /changed on another device/);
  assert.equal(filters.user_id, 'owner-a');
  assert.equal(filters.id, 'rent');
  assert.equal(filters.versions, JSON.stringify(initial.versions));
});

test('automatic backfill uses owner-scoped rules and cloud CAS; preserves existing transactions', async () => {
  const source = budget();
  source.months[0].fixed.push({ name: 'Rent', amount: 777, recurringRuleId: 'rent' });
  const before = structuredClone(source);
  let stored = source;
  let version = '2026-11-15T00:00:00.000Z';
  let writes = 0;
  const client = { from(table) {
    if (table === 'budget_recurring_rules') return { select() {
      return { eq(field, owner) {
        assert.equal(field, 'user_id'); assert.equal(owner, 'owner-a');
        return Promise.resolve({ data: [rule], error: null });
      } };
    } };
    assert.equal(table, 'budget_ui_years');
    return {
      select() { return { eq(field, owner) {
        assert.equal(field, 'user_id'); assert.equal(owner, 'owner-a');
        return { async eq(key, year) {
          assert.equal(key, 'year'); assert.equal(year, 2027);
          return { data: [{ year, budget_data: stored, updated_at: version }], error: null };
        } };
      } }; },
      update(changes) {
        const conditions = {};
        const query = {
          eq(key, value) { conditions[key] = value; return query; },
          async select() {
            assert.equal(conditions.user_id, 'owner-a');
            assert.equal(conditions.year, 2027);
            if (conditions.updated_at !== version) return { data: [], error: null };
            stored = changes.budget_data;
            version = changes.updated_at;
            writes++;
            return { data: [{ year: 2027 }], error: null };
          }
        };
        return query;
      }
    };
  } };
  const first = await backfillRecurringYear(client, 'owner-a', 2027);
  assert.equal(first.added, 11);
  assert.equal(first.saved, true);
  assert.deepEqual(stored.months[0].fixed, before.months[0].fixed);
  assert.deepEqual(source, before);
  const again = await backfillRecurringYear(client, 'owner-a', 2027);
  assert.equal(again.added, 0);
  assert.equal(again.saved, false);
  assert.equal(writes, 1);
});

test('automatic backfill does not duplicate ambiguous historical transactions', async () => {
  const source = budget();
  source.months[0].fixed.push({ name: 'Rent', amount: 600 });
  const client = {
    from(table) {
      if (table === 'budget_recurring_rules') {
        return {
          select() {
            return {
              async eq(field, owner) {
                assert.equal(field, 'user_id');
                assert.equal(owner, 'owner-a');
                return { data: [rule], error: null };
              }
            };
          }
        };
      }
      assert.equal(table, 'budget_ui_years');
      return {
        select() {
          const query = {
            eq(field, value) {
              assert.ok((field === 'user_id' && value === 'owner-a') ||
                (field === 'year' && value === 2027));
              return query;
            },
            then(resolve, reject) {
              return Promise.resolve({
                data: [{ year: 2027, budget_data: source,
                  updated_at: '2026-11-15T00:00:00.000Z' }], error: null
              }).then(resolve, reject);
            }
          };
          return query;
        },
        update(changes) {
          assert.equal(changes.budget_data.months[0].fixed.length, 1);
          const query = {
            eq() { return query; },
            async select() { return { data: [{ year: 2027 }], error: null }; }
          };
          return query;
        }
      };
    }
  };
  const result = await backfillRecurringYear(client, 'owner-a', 2027);
  assert.equal(result.added, 11);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.document.months[0].fixed.length, 1);
  assert.deepEqual(source.months[0].fixed, [{ name: 'Rent', amount: 600 }]);
});

test('cloud backfill only considers persisted years inside the rule date range', () => {
  assert.deepEqual(selectRecurringCloudYears([
    { year: 2029 }, { year: 2027 }, { year: 2027 }, { year: 2026 },
    { year: '2030' }, { year: 2201 }
  ], '2027-06-15', '2028-12-31'), ['2027']);
  assert.deepEqual(selectRecurringCloudYears([], '2026-01-01'), []);
  assert.throws(() => selectRecurringCloudYears([], '2026-12-01', '2026-01-01'), /dates/);
});

test('cloud snapshot guard refuses stale, unsynced, and foreign-owner budgets', () => {
  const cloud = { updated_at: 'revision-one', budget_data: budget() };
  const safe = () => ({
    owner: 'owner-a', activeOwner: 'owner-a', cloudRow: cloud,
    knownRevision: cloud.updated_at, inMemoryBudget: structuredClone(cloud.budget_data),
    cachedBudget: structuredClone(cloud.budget_data), hasLocalCache: true
  });
  assert.equal(requireRecurringCloudSnapshot(safe()), true);
  assert.throws(() => requireRecurringCloudSnapshot({ ...safe(), activeOwner: 'owner-b' }), /owner changed/);
  assert.throws(() => requireRecurringCloudSnapshot({ ...safe(), knownRevision: 'revision-old' }), /stale/);
  assert.throws(() => requireRecurringCloudSnapshot({ ...safe(), conflicted: true }), /reconciliation/);
  const dirty = structuredClone(cloud.budget_data);
  dirty.months[0].fixed.push({ name: 'Local unsaved rent', amount: 5 });
  assert.throws(() => requireRecurringCloudSnapshot({ ...safe(), inMemoryBudget: dirty }), /Local budget differs/);
  assert.throws(() => requireRecurringCloudSnapshot({ ...safe(), cachedBudget: dirty }), /Local budget differs/);
  assert.throws(() => requireRecurringCloudSnapshot({ ...safe(), cachedBudget: null }), /Local budget differs/);
});

test('recurring sync rejects a cloud revision changed after preflight without writing', async () => {
  const source = budget();
  let writes = 0;
  const client = { from(table) {
    assert.equal(table, 'budget_ui_years');
    return {
      select() { return { eq() { return { async eq() {
        return { data: [{ year: 2027, budget_data: source, updated_at: 'newer-revision' }], error: null };
      } }; } }; },
      update() { writes++; throw new Error('Update must not be attempted'); }
    };
  } };
  const build = doc => {
    const updated = structuredClone(doc);
    updated.months[0].fixed.push({ name: 'Rent', amount: 500 });
    return { document: updated, added: 1 };
  };
  await assert.rejects(() => commitRecurringYear(client, 'owner-a', 2027, build,
    { expectedUpdatedAt: 'older-revision' }), /changed since recurring synchronization/);
  await assert.rejects(() => commitRecurringYear(client, 'owner-a', 2027, build,
    { expectedUpdatedAt: 'newer-revision', canCommit: () => false }), /cancelled/);
  assert.equal(writes, 0);
});

test('legacy globally inactive rule resumes only from its future enabled version', async () => {
  let stored = { ...structuredClone(rule), active: false,
    start_date: '2026-11-15', versions: [{
      effectiveFrom: '2026-11-01', name: 'Rent', amount: 500,
      due: '15', accountId: null, frequency: 'monthly'
    }] };
  const query = () => ({ select() { return { eq(field, owner) {
    assert.equal(field, 'user_id'); assert.equal(owner, 'owner-a');
    return { async eq(key, value) {
      assert.equal(key, 'id'); assert.equal(value, 'rent');
      return { data: [stored], error: null };
    } };
  } }; }, update(change) { const filters = {};
    const updating = { eq(key, value) { filters[key] = value; return updating; },
      async select() {
        assert.equal(filters.user_id, 'owner-a');
        assert.equal(filters.id, 'rent');
        assert.equal(filters.active, false);
        assert.equal(filters.versions, JSON.stringify(stored.versions));
        stored = { ...stored, ...change };
        return { data: [{ id: stored.id }], error: null };
      }
    };
    return updating;
  } });
  const client = { from(table) { assert.equal(table, 'budget_recurring_rules'); return query(); } };
  await setRecurringRuleActive(client, 'owner-a', 'rent', true, '2026-12-01');
  assert.equal(stored.active, true);
  assert.deepEqual(stored.versions.map(v => [v.effectiveFrom, v.enabled]), [
    ['2026-11-01', false], ['2026-12-01', true]
  ]);
});

test('edits to future-starting rules may update their initial month without invalid date rejection', async () => {
  const future = { ...structuredClone(rule), start_date: '2028-01-15', versions: [{
    effectiveFrom: '2028-01-01', name: 'Rent', amount: 500,
    due: '15', accountId: null, frequency: 'monthly'
  }] };
  let changed;
  const client = { from() { return {
    select() { return { eq() { return { async eq() { return { data: [future], error: null }; } }; } }; },
    update(next) { const q = { eq() { return q; }, async select() {
      changed = next;
      return { data: [{ id: 'rent' }], error: null };
    } }; return q; }
  }; } };
  await editRecurringRule(client, 'owner-a', 'rent', { amount: 625 }, '2028-01-01');
  assert.equal(changed.versions.length, 1);
  assert.equal(changed.versions[0].amount, 625);
});

test('loaded rules expose next-month scheduling independently of current status', async () => {
  const today = new Date();
  const thisMonth = today.toISOString().slice(0, 7) + '-01';
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
    .toISOString().slice(0, 10);
  const latest = { ...rule, start_date: thisMonth, versions: [
    { effectiveFrom: thisMonth, name: 'Rent', amount: 500, frequency: 'monthly' },
    { effectiveFrom: nextMonth, name: 'Rent', amount: 650, frequency: 'monthly', enabled: false }
  ] };
  const client = { from() { return { select() { return { async eq() {
    return { data: [latest], error: null };
  } }; } }; } };
  const loaded = await loadRecurringPreviewRules(client, 'owner-a');
  assert.equal(loaded.rules[0].displayActive, true);
  assert.equal(loaded.rules[0].upcomingActive, false);
  assert.equal(loaded.rules[0].upcomingAmount, 650);
  assert.equal(loaded.rules[0].upcomingEffectiveFrom, nextMonth);
});
