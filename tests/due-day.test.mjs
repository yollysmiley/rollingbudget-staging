import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDueDay, dueDayOf, migrateYearDueDays, calendarDueDay } from '../scripts/due-day.mjs';

const blank = () => ({ months: Array.from({ length: 12 }, () => ({
  income: [], fixed: [], variable: [], creditCards: [], loans: []
})) });

test('parses numeric and ordinal legacy days, including historical incorrect suffixes', () => {
  for (const [input, expected] of [[1, 1], ['1', 1], ['1st', 1], ['22nd', 22],
    ['23th', 23], [' 16TH ', 16], ['31', 31], ['', null], [null, null]]) {
    assert.equal(parseDueDay(input), expected);
  }
  for (const invalid of [0, 32, -1, 2.5, '0', '32nd', 'next Friday', '2026-11-22', {}, true]) {
    assert.throws(() => parseDueDay(invalid), /Due day/);
  }
});

test('migrates legacy expense categories without changing source, money or metadata', () => {
  const source = blank();
  source.months[0].fixed.push({ name: 'Rent', due: '1st', amount: 1200 });
  source.months[0].variable.push({ name: 'Utility', due: '23th', amount: 30 });
  source.months[1].creditCards.push({ name: 'Card', due: '22', payment: 75 });
  source.months[2].loans.push({ name: 'Loan', due: '', balance: 100 });
  const before = structuredClone(source);
  const first = migrateYearDueDays(source);
  assert.equal(first.changed, true);
  assert.deepEqual(first.unrecognized, []);
  assert.deepEqual(source, before);
  assert.deepEqual(first.year.months[0].fixed[0], { name: 'Rent', dueDay: 1, amount: 1200 });
  assert.deepEqual(first.year.months[0].variable[0], { name: 'Utility', dueDay: 23, amount: 30 });
  assert.equal(first.year.months[1].creditCards[0].dueDay, 22);
  assert.equal(first.year.months[2].loans[0].dueDay, null);
  assert.equal(migrateYearDueDays(first.year).changed, false);
  assert.equal(migrateYearDueDays(first.year).year, first.year);
});

test('unrecognized legacy dates and conflicting values are never silently discarded', () => {
  const source = blank();
  source.months[0].fixed.push({ name: 'Invalid', due: 'end of month', amount: 10 });
  source.months[0].fixed.push({ name: 'Conflicting', due: '1st', dueDay: 22, amount: 15 });
  source.months[0].fixed.push({ name: 'Valid', due: '5th', amount: 20 });
  const migrated = migrateYearDueDays(source);
  assert.equal(migrated.unrecognized.length, 2);
  assert.deepEqual(migrated.year.months[0].fixed[0], source.months[0].fixed[0]);
  assert.deepEqual(migrated.year.months[0].fixed[1], source.months[0].fixed[1]);
  assert.equal(migrated.year.months[0].fixed[2].dueDay, 5);
  assert.throws(() => dueDayOf(source.months[0].fixed[1]), /Conflicting/);
});

test('31st remains stored while shorter months use their final calendar date', () => {
  assert.equal(calendarDueDay(2027, 0, 31), 31);
  assert.equal(calendarDueDay(2027, 1, 31), 28);
  assert.equal(calendarDueDay(2028, 1, 31), 29);
  assert.equal(calendarDueDay(2027, 3, 31), 30);
  assert.throws(() => calendarDueDay(2027, 0, 32), /Due day/);
});

test('migrated source plan matches numeric generated occurrences without duplicates', async () => {
  const { copyPreviousYearPlan } = await import('../scripts/year-plan.mjs');
  const source = blank(), target = blank();
  source.months[0].fixed.push({ name: 'Rent', due: '1st', amount: 900, accountId: 'checking' });
  target.months[0].fixed.push({
    name: 'Rent', dueDay: 1, amount: 900, accountId: 'checking',
    occurrenceId: 'scheduled-2027-01'
  });
  const copied = copyPreviousYearPlan(source, target);
  assert.equal(copied.months[0].fixed.length, 1);
  assert.deepEqual(source.months[0].fixed[0], { name: 'Rent', due: '1st', amount: 900, accountId: 'checking' });
});
