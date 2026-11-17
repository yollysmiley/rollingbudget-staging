import { accountIncluded } from './account-model.mjs';
import { dueDayOf } from './due-day.mjs';

export function entryAccount(entry, accounts) {
  if (!entry.accountId) return null;
  if (!accounts.some(account => account.id === entry.accountId)) throw new Error('Unknown account: ' + entry.accountId);
  return entry.accountId;
}

export function incomeAmount(entry, accounts) {
  if (entry.accountId) return accountIncluded(entry.accountId, accounts) ? Number(entry.amount) || 0 : 0;
  // Legacy CPM/USAA income remains intact and is filtered per source column.
  return (Number(entry.amount) || 0) + ['cpm', 'usaa'].reduce((sum, id) =>
    sum + ((Number(entry[id]) || 0) !== 0 && accountIncluded(id, accounts) ? Number(entry[id]) || 0 : 0), 0);
}

export function includedAmount(entry, accounts, field) {
  return accountIncluded(entry.accountId, accounts) ? Number(entry[field]) || 0 : 0;
}

// Category-based entries are additive only when stored in month.expenses; legacy
// fixed/variable arrays remain authoritative until an explicit one-time migration.
export function categoryExpenses(month) {
  if (month.expenseSchemaVersion === 2 && (month.fixed?.length || month.variable?.length)) {
    throw new Error('Migrated month contains duplicate legacy expense arrays');
  }
  if (month.expenses === undefined) {
    if (month.expenseSchemaVersion === 2) throw new Error('Migrated month has no category expenses');
    return [];
  }
  if (!Array.isArray(month.expenses)) throw new Error('Invalid category expense collection');
  return month.expenses;
}

export function computeAccountBudget(year, accounts) {
  if (!year?.months?.length) return [];
  let running = Number(year.months[0].recordedLeftover) || 0;
  return year.months.map((month, index) => {
    const startLeftover = index === 0 || !year.autoCascade ? Number(month.recordedLeftover) || 0 : running;
    const cpmIncome = month.income.reduce((sum, entry) =>
      sum + (entry.accountId === 'cpm' && accountIncluded('cpm', accounts) ? Number(entry.amount) || 0 : 0)
      + (!entry.accountId && (Number(entry.cpm) || 0) !== 0 && accountIncluded('cpm', accounts) ? Number(entry.cpm) || 0 : 0), 0);
    const usaaIncome = month.income.reduce((sum, entry) =>
      sum + (entry.accountId === 'usaa' && accountIncluded('usaa', accounts) ? Number(entry.amount) || 0 : 0)
      + (!entry.accountId && (Number(entry.usaa) || 0) !== 0 && accountIncluded('usaa', accounts) ? Number(entry.usaa) || 0 : 0), 0);
    const newIncome = month.income.reduce((sum, entry) => sum + incomeAmount(entry, accounts), 0);
    const fixedTotal = (month.expenseSchemaVersion === 2 ? categoryExpenses(month).filter(entry => entry.categoryId === 'fixed') : month.fixed).reduce((sum, entry) => sum + includedAmount(entry, accounts, 'amount'), 0);
    const varTotal = (month.expenseSchemaVersion === 2 ? categoryExpenses(month).filter(entry => entry.categoryId === 'variable') : month.variable).reduce((sum, entry) => sum + includedAmount(entry, accounts, 'amount'), 0);
    const categoryTotal = categoryExpenses(month).filter(entry => month.expenseSchemaVersion !== 2 || (entry.categoryId !== 'fixed' && entry.categoryId !== 'variable')).reduce((sum, entry) => sum + includedAmount(entry, accounts, 'amount'), 0);
    const ccTotal = month.creditCards.reduce((sum, entry) => sum + includedAmount(entry, accounts, 'payment'), 0);
    const loanTotal = month.loans.reduce((sum, entry) => sum + includedAmount(entry, accounts, 'payment'), 0);
    const totalOutflow = fixedTotal + varTotal + categoryTotal + ccTotal + loanTotal;
    const pre15Outflow = [
      ['expenses', 'amount'], ['creditCards', 'payment'], ['loans', 'payment'],
      ...(month.expenseSchemaVersion === 2 ? [] : [['fixed', 'amount'], ['variable', 'amount']])
    ].reduce((sum, [key, field]) => sum + (key === 'expenses' ? categoryExpenses(month) : month[key]).reduce((subtotal, entry) => {
      let day = 99;
      try { day = dueDayOf(entry) ?? 99; }
      catch { /* Unknown legacy due dates do not count as pre-15. */ }
      return subtotal + (day <= 15 ? includedAmount(entry, accounts, field) : 0);
    }, 0), 0);
    const totalAvailable = startLeftover + newIncome;
    const endingRollover = totalAvailable - totalOutflow;
    running = endingRollover;
    return { startLeftover, cpmIncome, usaaIncome, newIncome, fixedTotal, varTotal, categoryTotal, ccTotal, loanTotal, totalOutflow,
      totalAvailable, pre15Outflow, pre15Buffer: startLeftover - pre15Outflow,
      netMonthlyChange: newIncome - totalOutflow, endingRollover };
  });
}
