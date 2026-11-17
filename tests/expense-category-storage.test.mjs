import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExpenseCategories, saveExpenseCategory, updateExpenseCategory, deleteExpenseCategory } from '../scripts/expense-category-storage.mjs';

test('category storage refuses unauthenticated access', async () => {
  await assert.rejects(loadExpenseCategories(null, null), /Authenticated/);
  await assert.rejects(saveExpenseCategory(null, null, [], {}), /Authenticated/);
  await assert.rejects(updateExpenseCategory(null, null, [], 'x', 'Name'), /Authenticated/);
});

test('category loads are owner-filtered and preserve server revisions', async () => {
  const calls = [];
  const client = { from(table) {
    assert.equal(table, 'budget_expense_categories');
    return { select(fields) {
      assert.equal(fields, 'id,name,kind,updated_at');
      return { async eq(field, value) {
        calls.push([field, value]);
        return { data: [{ id: 'housing', name: 'Housing', kind: 'fixed', updated_at: '2026-11-17T00:00:00Z' }], error: null };
      } };
    } };
  } };
  const rows = await loadExpenseCategories(client, 'owner-a');
  assert.deepEqual(calls, [['user_id', 'owner-a']]);
  assert.equal(rows[0].updatedAt, '2026-11-17T00:00:00Z');
});

test('invalid and duplicate categories never reach cloud writes', async () => {
  let writes = 0;
  const client = { from() { writes++; throw Error('Unexpected write'); } };
  await assert.rejects(saveExpenseCategory(client, 'owner-a', [], { id: 'fixed', name: 'Duplicate', kind: 'fixed' }), /unique/);
  await assert.rejects(saveExpenseCategory(client, 'owner-a', [{ id: 'rent', name: 'Rent', kind: 'fixed' }],
    { id: 'new', name: 'RENT', kind: 'fixed' }), /unique/);
  assert.equal(writes, 0);
});

test('category inserts include authenticated owner scope', async () => {
  let inserted;
  const client = { from(table) {
    assert.equal(table, 'budget_expense_categories');
    return { async insert(row) { inserted = row; return { error: null }; } };
  } };
  await saveExpenseCategory(client, 'owner-a', [], { id: 'groceries', name: 'Groceries', kind: 'variable' });
  assert.deepEqual(inserted, { user_id: 'owner-a', id: 'groceries', name: 'Groceries', kind: 'variable' });
});

test('category deletion refuses unauthenticated access', async () => {
  await assert.rejects(deleteExpenseCategory(null, null, [], 'custom'), /Authenticated/);
});

test('category deletion fails closed when cloud year inventory fails', async () => {
  let deleted = false;
  const client = { from(table) {
    if (table === 'budget_ui_years') return { select() { return { async eq() { return { data: null, error: new Error('Year lookup failed') }; } }; } };
    deleted = true;
    throw new Error('Unexpected table access');
  } };
  await assert.rejects(deleteExpenseCategory(client, 'owner-a', [{ id: 'custom', name: 'Custom', kind: 'fixed' }], 'custom'), /Year lookup failed/);
  assert.equal(deleted, false);
});

test('category deletion refuses built-in categories without cloud access', async () => {
  await assert.rejects(deleteExpenseCategory({ from() { throw Error('Unexpected cloud access'); } }, 'owner-a', [], 'fixed'), /not found/);
});
