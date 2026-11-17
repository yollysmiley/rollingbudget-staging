import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('rollover-budget-app.html', 'utf8');

test('custom expense cards use category IDs and a month-scoped expense collection', () => {
  assert.match(app, /id="customExpenseCards"/);
  assert.match(app, /expenseCategories\.map\(category =>/);
  assert.match(app, /data-custom-expense-card=/);
  assert.match(app, /month\.expenses\.push\(\{ categoryId: id/);
  assert.match(app, /renderCustomExpenseCards\(m\)/);
});

test('custom cards provide editable names, due dates, amounts and account associations', () => {
  assert.match(app, /async function editCustomExpense/);
  assert.match(app, /async function deleteCustomExpense/);
  assert.match(app, /data-add-custom-expense/);
  assert.match(app, /accountOptions\(entry\.accountId\)/);
  assert.match(app, /account\.included === false/);
});

test('legacy default expense tables remain intact during incremental rollout', () => {
  assert.match(app, /id="fixedBody"/);
  assert.match(app, /id="variableBody"/);
  assert.match(app, /m\.fixed\.map/);
  assert.match(app, /m\.variable\.map/);
});
