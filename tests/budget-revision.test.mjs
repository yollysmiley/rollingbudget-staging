import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBudgetRevision, writeBudgetRevision } from '../scripts/budget-revision.mjs';

function fakeClient({ rows = [], error = null } = {}) {
  const calls = [];
  const client = { from(table) {
    assert.equal(table, 'budget_ui_years');
    return {
      update(payload) {
        const filters = [];
        return { eq(field, value) { filters.push([field, value]); return this; },
          async select(field) {
            assert.equal(field, 'year');
            calls.push({ type: 'update', payload, filters });
            return { data: rows, error };
          } };
      },
      async insert(payload) { calls.push({ type: 'insert', payload }); return { error }; }
    };
  } };
  return { client, calls };
}

test('revision advances monotonically beyond known cloud revision', () => {
  assert.equal(nextBudgetRevision('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.002Z'), '2026-01-01T00:00:00.003Z');
  assert.throws(() => nextBudgetRevision('invalid'), /invalid/);
});

test('existing-year save compares owner, year and expected revision', async () => {
  const { client, calls } = fakeClient({ rows: [{ year: 2027 }] });
  const result = await writeBudgetRevision(client, { owner: 'user-a', year: 2027, document: { months: [] }, knownRevision: '2026-01-01T00:00:00.000Z', requestedAt: '2026-01-01T00:00:00.000Z' });
  assert.deepEqual(result, { updatedAt: '2026-01-01T00:00:00.001Z', inserted: false });
  assert.deepEqual(calls[0].filters, [['user_id', 'user-a'], ['year', 2027], ['updated_at', '2026-01-01T00:00:00.000Z']]);
});

test('stale revision rejects rather than silently replacing cloud data', async () => {
  const { client } = fakeClient({ rows: [] });
  await assert.rejects(writeBudgetRevision(client, { owner: 'user-a', year: 2027, document: {}, knownRevision: '2026-01-01T00:00:00.000Z', requestedAt: '2026-01-02T00:00:00.000Z' }), /changed on another device/);
});

test('new-year creation inserts without an overwrite/upsert', async () => {
  const { client, calls } = fakeClient();
  const result = await writeBudgetRevision(client, { owner: 'user-a', year: 2028, document: {}, requestedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(result.inserted, true);
  assert.equal(calls[0].type, 'insert');
  assert.equal(calls[0].payload.user_id, 'user-a');
});

test('database write errors propagate to conflict-handling caller', async () => {
  const { client } = fakeClient({ error: new Error('network unavailable') });
  await assert.rejects(writeBudgetRevision(client, { owner: 'user-a', year: 2028, document: {}, requestedAt: '2026-01-01T00:00:00.000Z' }), /network unavailable/);
});
