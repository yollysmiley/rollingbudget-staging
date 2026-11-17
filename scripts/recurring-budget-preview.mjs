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
  if (existing === proposed) return true;
  const generic = new Set(['payment', 'monthly', 'annual', 'invoice', 'bill', 'charge', 'transfer']);
  const prefix = (shorter, longer) => longer.startsWith(shorter + ' ') &&
    shorter.length >= 4 && !generic.has(shorter);
  // A distinctive leading name may be the same transaction despite an amount change.
  if (prefix(existing, proposed) || prefix(proposed, existing)) return true;
  const words = name => name.split(' ').filter(word => word.length >= 5 && !generic.has(word));
  const shared = words(existing).filter(word => words(proposed).includes(word));
  // A shared descriptive word alone is insufficient: require financial context too.
  return shared.length > 0 && amountOf(entry) === Number(occurrence.amount) &&
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
    if (month.expenseSchemaVersion === 2 &&
        (!Array.isArray(month.expenses) || month.fixed.length || month.variable.length)) {
      throw new Error('Invalid migrated expense inventory');
    }
    if (month.expenses !== undefined && !Array.isArray(month.expenses)) {
      throw new Error('Invalid category expense inventory');
    }
    return { ...month, income: [...month.income], fixed: [...month.fixed],
      variable: [...month.variable], expenses: month.expenses ? [...month.expenses] : undefined,
      loans: [...month.loans], creditCards: [...month.creditCards] };
  });
  let added = 0;
  const skipped = [];
  for (const rule of rules) {
    for (const occurrence of scheduledOccurrences(rule, year)) {
      const index = Number(occurrence.scheduledMonth.slice(5, 7)) - 1;
      const target = TARGETS[occurrence.category];
      const migratedDefault = months[index].expenseSchemaVersion === 2 &&
        (occurrence.category === 'fixed' || occurrence.category === 'variable');
      const list = migratedDefault ? months[index].expenses : months[index][target];
      const inventories = [...Object.values(TARGETS).map(category => ({ category, entries: months[index][category] })),
        ...(months[index].expenses ? [{ category: 'expenses', entries: months[index].expenses }] : [])];
      // A legacy occurrence may have moved categories after manual edits.
      // Check every category for that month, not only the target category.
      const alreadyPresent = inventories.some(({ entries }) =>
        entries.some(entry =>
          entry.occurrenceId === occurrence.occurrenceId ||
          entry.recurringRuleId === rule.id));
      const possible = inventories.flatMap(({ category, entries }) =>
        entries.filter(entry => isPossibleDuplicate(entry, occurrence))
          .map(entry => ({ category, name: entry.name, amount: amountOf(entry), accountId: accountOf(entry) })));
      if (possible.length && !alreadyPresent) {
        ambiguous.push({ occurrenceId: occurrence.occurrenceId, month: occurrence.scheduledMonth,
          name: occurrence.name, amount: occurrence.amount, accountId: occurrence.accountId ?? null,
          matches: possible, classification: 'possible-duplicate' });
      }
      if (possible.length && !alreadyPresent && !approved.has(occurrence.occurrenceId)) {
        skipped.push(occurrence.occurrenceId);
        continue;
      }
      if (blocked.has(rule.id) || alreadyPresent) {
        skipped.push(occurrence.occurrenceId);
        continue;
      }
      const common = { name: occurrence.name, dueDay: occurrence.dueDay,
        accountId: occurrence.accountId, recurringRuleId: rule.id,
        occurrenceId: occurrence.occurrenceId };
      const item = occurrence.category === 'loan'
        ? { ...common, balance: 0, apr: 0, payment: occurrence.amount }
        : occurrence.category === 'cc'
          ? { ...common, statement: 0, apr: 0, payment: occurrence.amount }
          : { ...common, amount: occurrence.amount };
      list.push(migratedDefault ? { ...item, categoryId: occurrence.category } : item);
      added++;
    }
  }
  return { document: { ...yearDocument, months }, added, skipped, ambiguous };
}
