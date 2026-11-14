import { accountIncluded } from './account-model.mjs';

export function entryAccount(entry, accounts) {
  if (!entry.accountId) return null;
  if (!accounts.some(account => account.id === entry.accountId)) throw new Error('Unknown account: ' + entry.accountId);
  return entry.accountId;
}

export function incomeAmount(entry, accounts) {
  if (entry.accountId) return accountIncluded(entry.accountId, accounts) ? Number(entry.amount) || 0 : 0;
  // Legacy CPM/USAA income remains intact and is filtered per source column.
  return ['cpm', 'usaa'].reduce((sum, id) =>
    sum + (accountIncluded(id, accounts) ? Number(entry[id]) || 0 : 0), 0);
}

export function includedAmount(entry, accounts, field) {
  return accountIncluded(entry.accountId, accounts) ? Number(entry[field]) || 0 : 0;
}

export function computeAccountBudget(year, accounts) {
  if (!year?.months?.length) return [];
  let running = Number(year.months[0].recordedLeftover) || 0;
  return year.months.map((month, index) => {
    const startLeftover = index === 0 || !year.autoCascade ? Number(month.recordedLeftover) || 0 : running;
    const cpmIncome = month.income.reduce((sum, entry) =>
      sum + (entry.accountId === 'cpm' && accountIncluded('cpm', accounts) ? Number(entry.amount) || 0 : 0)
      + (!entry.accountId && accountIncluded('cpm', accounts) ? Number(entry.cpm) || 0 : 0), 0);
    const usaaIncome = month.income.reduce((sum, entry) =>
      sum + (entry.accountId === 'usaa' && accountIncluded('usaa', accounts) ? Number(entry.amount) || 0 : 0)
      + (!entry.accountId && accountIncluded('usaa', accounts) ? Number(entry.usaa) || 0 : 0), 0);
    const newIncome = month.income.reduce((sum, entry) => sum + incomeAmount(entry, accounts), 0);
    const fixedTotal = month.fixed.reduce((sum, entry) => sum + includedAmount(entry, accounts, 'amount'), 0);
    const varTotal = month.variable.reduce((sum, entry) => sum + includedAmount(entry, accounts, 'amount'), 0);
    const ccTotal = month.creditCards.reduce((sum, entry) => sum + includedAmount(entry, accounts, 'payment'), 0);
    const loanTotal = month.loans.reduce((sum, entry) => sum + includedAmount(entry, accounts, 'payment'), 0);
    const totalOutflow = fixedTotal + varTotal + ccTotal + loanTotal;
    const pre15Outflow = [
      ['fixed', 'amount'], ['variable', 'amount'], ['creditCards', 'payment'], ['loans', 'payment']
    ].reduce((sum, [key, field]) => sum + month[key].reduce((subtotal, entry) => {
      const day = Number(String(entry.due || '').match(/\d+/)?.[0] || 99);
      return subtotal + (day <= 15 ? includedAmount(entry, accounts, field) : 0);
    }, 0), 0);
    const totalAvailable = startLeftover + newIncome;
    const endingRollover = totalAvailable - totalOutflow;
    running = endingRollover;
    return { startLeftover, cpmIncome, usaaIncome, newIncome, fixedTotal, varTotal, ccTotal, loanTotal, totalOutflow,
      totalAvailable, pre15Outflow, pre15Buffer: startLeftover - pre15Outflow,
      netMonthlyChange: newIncome - totalOutflow, endingRollover };
  });
}
