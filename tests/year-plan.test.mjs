import test from 'node:test';
import assert from 'node:assert/strict';
import { copyPreviousYearPlan, isEmptyYearPlan } from '../scripts/year-plan.mjs';

const blank = () => ({
  autoCascade: true,
  recurringRules: [],
  months: Array.from({ length: 12 }, (_, i) => ({
    name: 'Month ' + i, recordedLeftover: i === 0 ? 120 : 0,
    income: [], fixed: [], variable: [], creditCards: [], loans: []
  }))
});

test('copies manual plans into an empty year without changing either input', () => {
  const source = blank(), target = blank();
  source.months[0].income.push({ id: 'old-pay', name: 'Salary', amount: 3000, accountId: 'checking' });
  source.months[0].fixed.push({ id: 'old-rent', name: 'Rent', due: '1st', amount: 1200, accountId: 'checking' });
  source.months[0].variable.push({ name: 'Food', due: '10th', amount: 400 });
  source.months[0].loans.push({ name: 'Loan', balance: 4500, payment: 150, apr: 6, due: '15th' });
  source.months[0].creditCards.push({ name: 'Card', statement: 600, payment: 75, apr: 19, due: '20th' });
  const before = structuredClone(source);
  const copied = copyPreviousYearPlan(source, target);
  assert.deepEqual(source, before);
  assert.equal(isEmptyYearPlan(target), true);
  assert.deepEqual(copied.months[0].income, [{ name: 'Salary', amount: 3000, accountId: 'checking' }]);
  assert.deepEqual(copied.months[0].fixed, [{ name: 'Rent', due: '1st', amount: 1200, accountId: 'checking' }]);
  assert.equal(copied.months[0].loans[0].balance, 0);
  assert.equal(copied.months[0].creditCards[0].statement, 0);
  assert.equal(copied.months[0].recordedLeftover, 120);
  copied.months[0].fixed[0].amount = 5;
  assert.equal(source.months[0].fixed[0].amount, 1200);
});

test('excludes scheduled recurring occurrences and does not copy recurring rule definitions', () => {
  const source = blank();
  source.recurringRules = [{ id: 'rule1', name: 'Monthly' }];
  source.months[1].fixed.push({ name: 'Recurring', amount: 100, occurrenceId: 'occ-1', recurringRuleId: 'rule1' });
  source.months[1].fixed.push({ name: 'Manual', amount: 75, due: '3rd' });
  const copied = copyPreviousYearPlan(source, blank());
  assert.deepEqual(copied.months[1].fixed, [{ name: 'Manual', amount: 75, due: '3rd' }]);
  assert.deepEqual(copied.recurringRules, []);
});

test('refuses to overwrite any existing target entry', () => {
  const target = blank();
  target.months[11].income.push({ name: 'Existing', amount: 5 });
  assert.equal(isEmptyYearPlan(target), false);
  assert.throws(() => copyPreviousYearPlan(blank(), target), /already contains entries/);
});

test('rejects malformed source and target documents', () => {
  assert.throws(() => copyPreviousYearPlan({ months: [] }, blank()), /twelve months/);
  const target = blank();
  delete target.months[3].fixed;
  assert.throws(() => copyPreviousYearPlan(blank(), target), /invalid month entries/);
});
