import { normalizeExpenseCategories, createExpenseCategory, renameExpenseCategory } from './expense-category-model.mjs';
import { nextBudgetRevision } from './budget-revision.mjs';

const tableName = 'budget_expense_categories';
function requireOwner(client, userId) {
  if (!client || !userId) throw new Error('Authenticated category owner required');
}
function normalizeRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Category lookup did not return rows');
  const categories = normalizeExpenseCategories(rows);
  return categories.map(category => ({
    ...category, updatedAt: rows.find(row => row.id === category.id)?.updated_at
  }));
}

export async function loadExpenseCategories(client, userId) {
  requireOwner(client, userId);
  const { data, error } = await client.from(tableName)
    .select('id,name,kind,updated_at').eq('user_id', userId);
  if (error) throw error;
  return normalizeRows(data);
}

export async function saveExpenseCategory(client, userId, categories, input) {
  requireOwner(client, userId);
  const validated = createExpenseCategory(categories, input);
  const category = validated.at(-1);
  const { error } = await client.from(tableName).insert({
    user_id: userId, id: category.id, name: category.name, kind: category.kind
  });
  if (error) throw error;
  return category;
}

async function currentRevision(client, userId, categories, id) {
  const expected = categories.find(category => category.id === id);
  if (!expected?.updatedAt) throw new Error('Category changed on another device; reload');
  const { data, error } = await client.from(tableName)
    .select('id,name,kind,updated_at').eq('user_id', userId).eq('id', id);
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1 ||
      data[0].updated_at !== expected.updatedAt ||
      data[0].name !== expected.name || data[0].kind !== expected.kind) {
    throw new Error('Category changed on another device; reload');
  }
  return expected.updatedAt;
}

export async function updateExpenseCategory(client, userId, categories, id, name) {
  requireOwner(client, userId);
  const updated = renameExpenseCategory(categories, id, name).find(category => category.id === id);
  const revision = await currentRevision(client, userId, categories, id);
  const { data, error } = await client.from(tableName)
    .update({ name: updated.name, updated_at: nextBudgetRevision(new Date().toISOString(), revision) })
    .eq('user_id', userId).eq('id', id).eq('updated_at', revision).select('id');
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) throw new Error('Category changed on another device; reload');
  return updated;
}
