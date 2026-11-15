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

test('exclusion covers income, fixed, variable, credit cards, loans and pre-15 outflow without deleting entries', () => {
  const accounts = [{ id: 'checking', name: 'Checking', included: true }, { id: 'hidden', name: 'Hidden', included: false }];
  const january = {
    recordedLeftover: 10,
    income: [{ accountId: 'checking', amount: 200 }, { accountId: 'hidden', amount: 1000 }],
    fixed: [{ accountId: 'hidden', amount: 100, due: '1st' }, { accountId: 'checking', amount: 20, due: '1st' }],
    variable: [{ accountId: 'hidden', amount: 90, due: '5th' }],
    creditCards: [{ accountId: 'hidden', payment: 80, due: '10th' }],
    loans: [{ accountId: 'hidden', payment: 70, due: '12th' }]
  };
  const year = { autoCascade: true, months: [january, month()] };
  const snapshot = structuredClone(year);
  const [first, second] = computeAccountBudget(year, accounts);
  assert.equal(first.newIncome, 200);
  assert.equal(first.fixedTotal, 20);
  assert.equal(first.varTotal, 0);
  assert.equal(first.ccTotal, 0);
  assert.equal(first.loanTotal, 0);
  assert.equal(first.pre15Outflow, 20);
  assert.equal(first.totalOutflow, 20);
  assert.equal(first.endingRollover, 190);
  assert.equal(second.startLeftover, 190);
  assert.deepEqual(year, snapshot);
  const restored = computeAccountBudget(year, accounts.map(account => ({ ...account, included: true })))[0];
  assert.equal(restored.newIncome, 1200);
  assert.equal(restored.totalOutflow, 360);
  assert.equal(restored.endingRollover, 850);
});

test('new budgets with no named accounts still count unassigned amount-based income', () => {
  const result = computeAccountBudget({ autoCascade: true, months: [month([{ name: 'Unassigned', amount: 300 }])] }, [])[0];
  assert.equal(result.newIncome, 300);
  assert.equal(result.totalAvailable, 300);
});

test('zero-valued legacy columns do not require unseeded legacy accounts', () => {
  const year = { autoCascade: true, months: [month([{ name: 'Current pay', amount: 125, cpm: 0, usaa: 0 }])] };
  assert.equal(computeAccountBudget(year, [])[0].newIncome, 125);
  assert.equal(incomeAmount({ amount: 125, cpm: 0, usaa: 0 }, []), 125);
});
