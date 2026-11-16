import test from 'node:test';
import assert from 'node:assert/strict';
import { copyPreviousYearPlan, isEmptyYearPlan, projectedJanuaryOpening, canApplyJanuaryOpening } from '../scripts/year-plan.mjs';

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
  assert.deepEqual(copied.months[0].fixed, [{ name: 'Rent', dueDay: 1, amount: 1200, accountId: 'checking' }]);
  assert.equal(copied.months[0].loans[0].balance, 0);
  assert.equal(copied.months[0].loans[0].dueDay, 15);
  assert.equal(copied.months[0].creditCards[0].dueDay, 20);
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
  assert.deepEqual(copied.months[1].fixed, [{ name: 'Manual', amount: 75, dueDay: 3 }]);
  assert.deepEqual(copied.recurringRules, []);
});

test('refuses to overwrite any existing target entry', () => {
  const target = blank();
  target.months[11].income.push({ name: 'Existing', amount: 5 });
  assert.equal(isEmptyYearPlan(target), false);
  assert.throws(() => copyPreviousYearPlan(blank(), target), /already contains manual entries/);
});

test('rejects malformed source and target documents', () => {
  assert.throws(() => copyPreviousYearPlan({ months: [] }, blank()), /twelve months/);
  const target = blank();
  delete target.months[3].fixed;
  assert.throws(() => copyPreviousYearPlan(blank(), target), /invalid month entries/);
});

test('projects December into January without mutating either year', async () => {
  const { computeAccountBudget } = await import('../scripts/account-budget.mjs');
  const previous = blank(), target = blank();
  previous.months[11].income.push({ name: 'December pay', amount: 500, accountId: null });
  previous.months[11].fixed.push({ name: 'December bill', amount: 200 });
  assert.equal(projectedJanuaryOpening(previous, [], computeAccountBudget), 420);
  assert.equal(canApplyJanuaryOpening(target), false); // target starts with a manual 120
  target.months[0].recordedLeftover = 0;
  assert.equal(canApplyJanuaryOpening(target), true);
  assert.equal(target.months[0].recordedLeftover, 0);
  previous.months[11].fixed[0].amount = 700;
  assert.equal(projectedJanuaryOpening(previous, [], computeAccountBudget), -80);
});

test('rejects non-finite December projections and preserves manual opening', () => {
  const year = blank();
  assert.throws(() => projectedJanuaryOpening(year, [], () => Array(12).fill({ endingRollover: NaN })), /could not be calculated/);
  year.months[0].recordedLeftover = -25;
  assert.equal(canApplyJanuaryOpening(year), false);
});

test('copies into a generated-only year without changing or duplicating scheduled entries', () => {
  const source = blank(), target = blank();
  source.months[0].fixed.push({ name: 'Rent', due: '1st', amount: 900, accountId: 'checking' });
  source.months[0].fixed.push({ name: 'Utilities', due: '5th', amount: 70 });
  target.months[0].fixed.push({
    name: 'Rent', dueDay: 1, amount: 900, accountId: 'checking',
    recurringRuleId: 'rent-rule', occurrenceId: 'rent-2027-01'
  });
  target.months[1].income.push({
    name: 'Paycheck', amount: 2500, occurrenceId: 'pay-2027-02'
  });
  const before = structuredClone(target);
  assert.equal(isEmptyYearPlan(target), true);
  const copied = copyPreviousYearPlan(source, target);
  assert.deepEqual(target, before);
  assert.deepEqual(copied.months[0].fixed.map(entry => entry.name), ['Rent', 'Utilities']);
  assert.equal(copied.months[0].fixed[0].occurrenceId, 'rent-2027-01');
  assert.equal(copied.months[0].fixed[1].dueDay, 5);
  assert.deepEqual(copied.months[1].income, target.months[1].income);
  assert.equal(isEmptyYearPlan(copied), false);
  assert.throws(() => copyPreviousYearPlan(source, copied), /already contains manual entries/);
});

test('different manual amounts and accounts are not silently discarded as generated duplicates', () => {
  const source = blank(), target = blank();
  source.months[0].fixed.push({ name: 'Rent', due: '1st', amount: 950, accountId: 'checking' });
  target.months[0].fixed.push({
    name: 'Rent', due: '1st', amount: 900, accountId: 'checking', occurrenceId: 'rent-2027-01'
  });
  const copied = copyPreviousYearPlan(source, target);
  assert.deepEqual(copied.months[0].fixed.map(entry => entry.amount), [900, 950]);
});

test('existing manual target entries block copying even alongside generated entries', () => {
  const source = blank(), target = blank();
  source.months[0].income.push({ name: 'Salary', amount: 100 });
  target.months[0].fixed.push({ name: 'Scheduled', amount: 20, occurrenceId: 'occ' });
  target.months[2].variable.push({ name: 'Custom budget', amount: 35 });
  assert.equal(isEmptyYearPlan(target), false);
  assert.throws(() => copyPreviousYearPlan(source, target), /already contains manual entries/);
});
