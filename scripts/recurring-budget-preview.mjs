import { scheduledOccurrences } from './recurring-scheduler.mjs';

const TARGETS = Object.freeze({
  income: 'income', fixed: 'fixed', variable: 'variable',
  loan: 'loans', cc: 'creditCards'
});

const normalizedName = value => String(value ?? '').toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
const amountOf = entry => Number(entry.amount ?? entry.payment);
const accountOf = entry => entry.accountId ?? entry.acct ?? null;
function isPossibleDuplicate(entry, occurrence) {
  if (entry.occurrenceId || entry.recurringRuleId) return false;
  const existing = normalizedName(entry.name);
  const proposed = normalizedName(occurrence.name);
  if (!existing || !proposed) return false;
  const words = name => name.split(' ').filter(word => word.length > 3);
  const similar = existing.includes(proposed) || proposed.includes(existing) ||
    words(existing).some(word => words(proposed).includes(word));
  return similar && amountOf(entry) === Number(occurrence.amount) &&
    accountOf(entry) === (occurrence.accountId ?? null);
}

// Pure preview used by both desktop and mobile views. It never changes budgets.
// Existing legacy entries cannot reliably be deduplicated without a verified
// source-rule mapping, so a matching rule ID in a month blocks generation there.
export function previewRecurringYear(yearDocument, year, rules, { blockedRuleIds = [], approvedOccurrenceIds = [] } = {}) {
  if (!yearDocument || !Array.isArray(yearDocument.months) || yearDocument.months.length !== 12) {
    throw new Error('Complete 12-month budget required');
  }
  if (!Array.isArray(rules)) throw new TypeError('Rules required');
  const blocked = new Set(blockedRuleIds);
  const approved = new Set(approvedOccurrenceIds);
  const ambiguous = [];
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
      // A legacy occurrence may have moved categories after manual edits.
      // Check every category for that month, not only the target category.
      const alreadyPresent = Object.values(TARGETS).some(category =>
        months[index][category].some(entry =>
          entry.occurrenceId === occurrence.occurrenceId ||
          entry.recurringRuleId === rule.id ||
          // Conservatively block an untagged same-name entry in this month.
          // Never overwrite or silently duplicate a manually recorded transaction.
          (!entry.occurrenceId && !entry.recurringRuleId &&
            typeof entry.name === 'string' &&
            entry.name.trim().toLocaleLowerCase() === occurrence.name.trim().toLocaleLowerCase())));
      const possible = Object.values(TARGETS).flatMap(category =>
        months[index][category].filter(entry => isPossibleDuplicate(entry, occurrence))
          .map(entry => ({ category, name: entry.name, amount: amountOf(entry), accountId: accountOf(entry) })));
      if (possible.length) {
        ambiguous.push({ occurrenceId: occurrence.occurrenceId, month: occurrence.scheduledMonth,
          name: occurrence.name, amount: occurrence.amount, accountId: occurrence.accountId ?? null,
          matches: possible });
      }
      if (possible.length && !approved.has(occurrence.occurrenceId)) {
        skipped.push(occurrence.occurrenceId);
        continue;
      }
      if (blocked.has(rule.id) || alreadyPresent) {
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
  return { document: { ...yearDocument, months }, added, skipped, ambiguous };
}
