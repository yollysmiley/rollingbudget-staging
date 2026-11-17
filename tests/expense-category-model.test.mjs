import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_EXPENSE_CATEGORIES, normalizeExpenseCategories, createExpenseCategory,
  renameExpenseCategory, canDeleteExpenseCategory
} from '../scripts/expense-category-model.mjs';

const sample = { id: 'utilities', name: 'Utilities', kind: 'variable' };

test('new users have built-in categories and no custom categories', () => {
  assert.deepEqual(normalizeExpenseCategories([]), []);
  assert.deepEqual(BUILTIN_EXPENSE_CATEGORIES.map(category => category.id), ['fixed', 'variable']);
});

test('custom category names are trimmed, unique case-insensitively, and nonblank', () => {
  assert.deepEqual(createExpenseCategory([], { ...sample, name: ' Utilities ' }), [{ ...sample, builtin: false }]);
  assert.throws(() => createExpenseCategory([sample], { id: 'other', name: 'UTILITIES', kind: 'fixed' }), /unique/);
  assert.throws(() => createExpenseCategory([], { ...sample, name: '  ' }), /nonblank/);
  assert.throws(() => createExpenseCategory([], { ...sample, name: 'Fixed Expenses' }), /unique/);
  assert.throws(() => createExpenseCategory([], { ...sample, id: 'fixed' }), /unique/);
  assert.throws(() => createExpenseCategory([], { ...sample, kind: 'income' }), /fixed or variable/);
});

test('renaming preserves stable category ID and does not mutate existing records', () => {
  const before = [sample];
  const renamed = renameExpenseCategory(before, 'utilities', 'Household Utilities');
  assert.deepEqual(renamed, [{ ...sample, name: 'Household Utilities', builtin: false }]);
  assert.deepEqual(before, [sample]);
  assert.throws(() => renameExpenseCategory(before, 'missing', 'Other'), /not found/);
});

test('populated categories cannot be deleted even if entries are historical or zero-dollar', () => {
  const years = { 2024: { months: [{ fixed: [], variable: [{ categoryId: 'utilities', amount: 0 }] }] } };
  assert.equal(canDeleteExpenseCategory('utilities', years, []), false);
  assert.equal(canDeleteExpenseCategory('utilities', { 2024: { months: [{ fixed: [], variable: [] }] } }, []), true);
});

test('disabled and future recurring references block deletion; incomplete inventory fails closed', () => {
  const years = { 2026: { months: [{ fixed: [], variable: [] }] } };
  assert.equal(canDeleteExpenseCategory('utilities', years, [{ category_id: 'utilities', active: false }]), false);
  assert.equal(canDeleteExpenseCategory('utilities', years, [{ categoryId: 'utilities', startDate: '2030-01-01' }]), false);
  assert.equal(canDeleteExpenseCategory('utilities', null, []), false);
  assert.equal(canDeleteExpenseCategory('utilities', years, null), false);
  assert.equal(canDeleteExpenseCategory('utilities', { 2026: { months: [{}] } }, []), false);
  assert.equal(canDeleteExpenseCategory('fixed', years, []), false);
});
