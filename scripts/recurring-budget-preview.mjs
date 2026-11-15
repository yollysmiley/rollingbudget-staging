import { scheduledOccurrences } from './recurring-scheduler.mjs';

const TARGETS = Object.freeze({
  income: 'income', fixed: 'fixed', variable: 'variable',
  loan: 'loans', cc: 'creditCards'
});

// Pure preview used by both desktop and mobile views. It never changes budgets.
// Existing legacy entries cannot reliably be deduplicated without a verified
// source-rule mapping, so a matching rule ID in a month blocks generation there.
export function previewRecurringYear(yearDocument, year, rules, { blockedRuleIds = [] } = {}) {
  if (!yearDocument || !Array.isArray(yearDocument.months) || yearDocument.months.length !== 12) {
    throw new Error('Complete 12-month budget required');
  }
  if (!Array.isArray(rules)) throw new TypeError('Rules required');
  const blocked = new Set(blockedRuleIds);
  const months = yearDocument.months.map(month => {
    for (const target of Object.values(TARGETS)) {
      if (!Array.isArray(month?.[target])) throw new Error('Invalid budget category: ' + target);
    }
    return { ...month, income: [...month.income], fixed: [...month.fixed],
      variable: [...month.variable], loans: [...month.loans], creditCards: [...month.creditCards] };
  });
  let added = 0;
  const skipped = [];
  for (const rule of rules) {
    for (const occurrence of scheduledOccurrences(rule, year)) {
      const index = Number(occurrence.scheduledMonth.slice(5, 7)) - 1;
      const target = TARGETS[occurrence.category];
      const list = months[index][target];
      if (blocked.has(rule.id) || list.some(entry =>
        entry.occurrenceId === occurrence.occurrenceId ||
        entry.recurringRuleId === rule.id)) {
        skipped.push(occurrence.occurrenceId);
        continue;
      }
      const common = { name: occurrence.name, due: occurrence.due,
        accountId: occurrence.accountId, recurringRuleId: rule.id,
        occurrenceId: occurrence.occurrenceId };
      const item = occurrence.category === 'loan'
        ? { ...common, balance: 0, apr: 0, payment: occurrence.amount }
        : occurrence.category === 'cc'
          ? { ...common, statement: 0, apr: 0, payment: occurrence.amount }
          : { ...common, amount: occurrence.amount };
      list.push(item);
      added++;
    }
  }
  return { document: { ...yearDocument, months }, added, skipped };
}
