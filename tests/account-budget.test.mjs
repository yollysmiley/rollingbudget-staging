import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccountBudget, incomeAmount } from '../scripts/account-budget.mjs';

const accounts = [
  { id: 'cpm', name: 'CPM', included: true },
  { id: 'usaa', name: 'USAA', included: false },
  { id: 'custom', name: 'Custom', included: true }
];
const month = (income = [], fixed = []) => ({
  recordedLeftover: 0, income, fixed, variable: [], creditCards: [], loans: []
});
test('legacy income columns are filtered separately without mutating source', () => {
  const original = { name: 'Pay', cpm: 120, usaa: 80 };
  assert.equal(incomeAmount(original, accounts), 120);
  assert.deepEqual(original, { name: 'Pay', cpm: 120, usaa: 80 });
});
test('dynamic income and excluded outflows are omitted across all totals', () => {
  const data = { autoCascade: true, months: [month([
    { name: 'Pay', cpm: 120, usaa: 80 },
    { name: 'Bonus', accountId: 'custom', amount: 40 },
    { name: 'Hidden', accountId: 'usaa', amount: 500 }
  ], [{ accountId: 'usaa', amount: 90, due: '10' }, { accountId: 'custom', amount: 25, due: '10' }])] };
  const [result] = computeAccountBudget(data, accounts);
  assert.equal(result.newIncome, 160);
  assert.equal(result.fixedTotal, 25);
  assert.equal(result.pre15Outflow, 25);
  assert.equal(result.endingRollover, 135);
});
test('excluded entries never affect later month rollover', () => {
  const data = { autoCascade: true, months: [
    month([{ accountId: 'custom', amount: 100 }], [{ accountId: 'usaa', amount: 300, due: '1' }]),
    month([], [{ accountId: 'custom', amount: 20, due: '1' }])
  ] };
  const [first, second] = computeAccountBudget(data, accounts);
  assert.equal(first.endingRollover, 100);
  assert.equal(second.startLeftover, 100);
  assert.equal(second.endingRollover, 80);
});
test('unassigned historical expenses remain included until assigned', () => {
  const [result] = computeAccountBudget({ autoCascade: false, months: [month([], [{ name: 'Rent', amount: 50 }])] }, accounts);
  assert.equal(result.fixedTotal, 50);
});
