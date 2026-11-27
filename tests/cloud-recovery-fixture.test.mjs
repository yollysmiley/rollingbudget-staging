import test from 'node:test';
import assert from 'node:assert/strict';
import { writeBudgetRevision } from '../scripts/budget-revision.mjs';

// Each test owns its cloud; clients share rows, never browser storage.
function sharedCloud() {
  const rows = new Map();
  const key = (owner, year) => JSON.stringify([owner, Number(year)]);
  function client(owner) {
    let failure = null;
    let delayed = null;
    async function write(operation) {
      const fault = failure;
      failure = null;
      if (delayed) {
        const gate = delayed;
        delayed = null;
        await gate;
      }
      if (fault && !fault.afterCommit) return { error: fault.error };
      const result = operation();
      return fault && fault.afterCommit && !result.error ? { error: fault.error } : result;
    }
    return {
      failNext(error, afterCommit = false) { failure = { error, afterCommit }; },
      delayNext() {
        let release;
        delayed = new Promise(resolve => { release = resolve; });
        return release;
      },
      read(year) { return structuredClone(rows.get(key(owner, year)) ?? null); },
      from(table) {
        assert.equal(table, 'budget_ui_years');
        return {
          insert(row) {
            return write(() => {
              if (row.user_id !== owner) return { error: { status: 403 } };
              const id = key(owner, row.year);
              if (rows.has(id)) return { error: { code: '23505' } };
              rows.set(id, structuredClone(row));
              return { error: null };
            });
          },
          update(changes) {
            const filters = {};
            return {
              eq(field, value) { filters[field] = value; return this; },
              select() {
                return write(() => {
                  const id = key(owner, filters.year);
                  const row = rows.get(id);
                  if (filters.user_id !== owner || !row || row.updated_at !== filters.updated_at)
                    return { data: [], error: null };
                  rows.set(id, structuredClone({ ...row, ...changes }));
                  return { data: [{ year: row.year }], error: null };
                });
              }
            };
          }
        };
      }
    };
  }
  return { client };
}
const requestedAt = '2026-01-01T00:00:00.000Z';
const save = (client, owner, amount, knownRevision = null) =>
  writeBudgetRevision(client, { owner, year: 2026, document: { amount }, knownRevision, requestedAt });

test('shared cloud isolates owners and begins empty', async () => {
  const cloud = sharedCloud(), a = cloud.client('a'), b = cloud.client('b');
  assert.equal(a.read(2026), null);
  await save(a, 'a', 100);
  assert.equal(b.read(2026), null);
  await save(b, 'b', 200);
  await assert.rejects(save(b, 'a', 999), error => error.status === 403);
  assert.equal(a.read(2026).budget_data.amount, 100);
  assert.equal(b.read(2026).budget_data.amount, 200);
});

test('offline rejection and lost response have distinct authoritative states', async () => {
  const cloud = sharedCloud(), a = cloud.client('a'), observer = cloud.client('a');
  const error = { message: 'offline', status: 503 };
  a.failNext(error);
  await assert.rejects(save(a, 'a', 100), actual => actual === error);
  assert.equal(observer.read(2026), null);
  a.failNext(error, true);
  await assert.rejects(save(a, 'a', 100), actual => actual === error);
  assert.equal(observer.read(2026).budget_data.amount, 100);
  assert.equal(observer.read(2026).updated_at, requestedAt);
});

test('delayed migration-shaped write cannot overwrite an intervening revision', async () => {
  const cloud = sharedCloud(), a = cloud.client('a'), b = cloud.client('a');
  const initial = await save(a, 'a', 100);
  const release = a.delayNext();
  const migration = save(a, 'a', 100, initial.updatedAt);
  const rejected = assert.rejects(migration, /changed on another device/);
  await save(b, 'a', 200, initial.updatedAt);
  release();
  await rejected;
  assert.equal(a.read(2026).budget_data.amount, 200);
});
