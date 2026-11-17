// Pure, repeatable conversion from legacy expense arrays to category-owned entries.
// The conversion is opt-in; callers must persist the returned year only after validation.
export function migrateExpenseMonth(month) {
  if (!month || typeof month !== 'object' || !Array.isArray(month.fixed) ||
      !Array.isArray(month.variable) ||
      (month.expenses !== undefined && !Array.isArray(month.expenses))) {
    throw new Error('Invalid month expense inventory');
  }
  if (month.expenseSchemaVersion === 2) {
    if (month.fixed.length || month.variable.length) {
      throw new Error('Migrated month contains legacy expense duplicates');
    }
    return { ...month, expenses: month.expenses.map(entry => ({ ...entry })) };
  }
  const expenses = [
    ...(month.expenses ?? []).map(entry => ({ ...entry })),
    ...month.fixed.map(entry => ({ ...entry, categoryId: 'fixed' })),
    ...month.variable.map(entry => ({ ...entry, categoryId: 'variable' }))
  ];
  return { ...month, expenses, fixed: [], variable: [], expenseSchemaVersion: 2 };
}

export function migrateExpenseYear(year) {
  if (!year || !Array.isArray(year.months)) throw new Error('Invalid budget year');
  return { ...year, months: year.months.map(migrateExpenseMonth) };
}

export function categoryEntries(month, categoryId) {
  if (!month || typeof month !== 'object') throw new Error('Invalid month');
  if (month.expenseSchemaVersion === 2) {
    if (!Array.isArray(month.expenses)) throw new Error('Missing migrated expenses');
    return month.expenses.filter(entry => entry.categoryId === categoryId);
  }
  if (categoryId === 'fixed' || categoryId === 'variable') {
    if (!Array.isArray(month[categoryId])) throw new Error('Missing legacy expenses');
    return month[categoryId];
  }
  if (month.expenses !== undefined && !Array.isArray(month.expenses)) throw new Error('Invalid category expenses');
  return (month.expenses ?? []).filter(entry => entry.categoryId === categoryId);
}
