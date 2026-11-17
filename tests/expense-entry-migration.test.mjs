import test from 'node:test';
import { computeAccountBudget } from '../scripts/account-budget.mjs';
import assert from 'node:assert/strict';
import { migrateExpenseMonth, migrateExpenseYear, categoryEntries, verifyExpenseMigration } from '../scripts/expense-entry-migration.mjs';

test('legacy expenses migrate to stable default category IDs without changing original data', () => {
  const month = { name: 'Jan', fixed: [{ name: 'Rent', amount: 900, accountId: 'a', dueDay: 1 }],
    variable: [{ name: 'Food', amount: 0 }], expenses: [{ categoryId: 'pets', name: 'Vet', amount: 40 }] };
  const migrated = migrateExpenseMonth(month);
  assert.deepEqual(migrated.expenses.map(e => e.categoryId), ['pets', 'fixed', 'variable']);
  assert.deepEqual(migrated.fixed, []);
  assert.deepEqual(migrated.variable, []);
  assert.equal(migrated.expenses[1].accountId, 'a');
  assert.equal(migrated.expenses[1].dueDay, 1);
  assert.equal(migrated.expenses[2].amount, 0);
  assert.equal(month.fixed.length, 1);
  assert.deepEqual(migrateExpenseMonth(migrated), migrated);
});

test('year migration preserves metadata and all months without modifying the source', () => {
  const year = { autoCascade: true, months: [{ fixed: [{ amount: 5 }], variable: [] }, { fixed: [], variable: [] }] };
  const migrated = migrateExpenseYear(year);
  assert.equal(migrated.autoCascade, true);
  assert.equal(migrated.months[0].expenses.length, 1);
  assert.equal(migrated.months[1].expenses.length, 0);
  assert.equal(year.months[0].fixed.length, 1);
  assert.deepEqual(migrateExpenseYear(migrated), migrated);
});

test('category reader supports both representations without double-counting', () => {
  const month = { fixed: [{ amount: 15 }], variable: [], expenses: [{ categoryId: 'utilities', amount: 20 }] };
  assert.deepEqual(categoryEntries(month, 'fixed'), [{ amount: 15 }]);
  assert.deepEqual(categoryEntries(month, 'utilities'), [{ categoryId: 'utilities', amount: 20 }]);
  const migrated = migrateExpenseMonth(month);
  assert.deepEqual(categoryEntries(migrated, 'fixed'), [{ amount: 15, categoryId: 'fixed' }]);
});

test('corrupt and ambiguous migrated inventories fail closed', () => {
  assert.throws(() => migrateExpenseMonth({ fixed: null, variable: [] }), /Invalid/);
  assert.throws(() => migrateExpenseMonth({ fixed: [], variable: [], expenses: null }), /Invalid/);
  assert.throws(() => migrateExpenseMonth({ fixed: [{ amount: 2 }], variable: [], expenses: [], expenseSchemaVersion: 2 }), /duplicates/);
});

test('migration parity gate accepts unchanged financial outcomes', () => {
  const source = { autoCascade: true, months: [{
    recordedLeftover: 100, income: [], fixed: [{ amount: 20, dueDay: 5 }],
    variable: [{ amount: 10, dueDay: 20 }], creditCards: [], loans: []
  }] };
  const migrated = migrateExpenseYear(source);
  assert.equal(verifyExpenseMigration(source, migrated, [], computeAccountBudget), true);
});

test('migration parity gate rejects changed amounts or missing months', () => {
  const source = { autoCascade: true, months: [{
    recordedLeftover: 100, income: [], fixed: [{ amount: 20, dueDay: 5 }],
    variable: [], creditCards: [], loans: []
  }] };
  const migrated = migrateExpenseYear(source);
  migrated.months[0].expenses[0].amount = 19;
  assert.throws(() => verifyExpenseMigration(source, migrated, [], computeAccountBudget), /changed budget calculations/);
  assert.throws(() => verifyExpenseMigration(source, { months: [] }, [], computeAccountBudget), /inventory changed/);
});

test('mixed default-category data and unknown schema versions are rejected', () => {
  assert.throws(() => migrateExpenseMonth({ fixed: [], variable: [],
    expenses: [{ categoryId: 'fixed', amount: 5 }] }), /already exist/);
  assert.throws(() => migrateExpenseMonth({ fixed: [], variable: [],
    expenseSchemaVersion: 3 }), /Unsupported/);
});
