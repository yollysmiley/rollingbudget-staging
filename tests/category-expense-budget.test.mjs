import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccountBudget, categoryExpenses } from '../scripts/account-budget.mjs';

const accounts = [{ id: 'checking', name: 'Checking', excluded: false }];
const month = (overrides = {}) => ({
  recordedLeftover: 1000, income: [], fixed: [], variable: [],
  creditCards: [], loans: [], ...overrides
});

test('new category expenses contribute once to outflow, pre-15 buffer and rollover', () => {
  const result = computeAccountBudget({ autoCascade: true, months: [
    month({ fixed: [{ name: 'Legacy', amount: 100, dueDay: 10 }],
      expenses: [{ categoryId: 'housing', name: 'Rent', amount: 200, dueDay: 12 }] }),
    month()
  ] }, accounts);
  assert.equal(result[0].categoryTotal, 200);
  assert.equal(result[0].totalOutflow, 300);
  assert.equal(result[0].pre15Outflow, 300);
  assert.equal(result[0].endingRollover, 700);
  assert.equal(result[1].startLeftover, 700);
});

test('legacy months without expenses retain existing totals', () => {
  assert.deepEqual(categoryExpenses(month()), []);
  const [result] = computeAccountBudget({ autoCascade: false, months: [
    month({ variable: [{ amount: 25, dueDay: 20 }] })
  ] }, accounts);
  assert.equal(result.totalOutflow, 25);
  assert.equal(result.categoryTotal, 0);
});

test('invalid expense collection fails closed instead of silently losing spending', () => {
  assert.throws(() => categoryExpenses(month({ expenses: null })), /Invalid category/);
});
