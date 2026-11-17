// Expense category definitions are owner-global; budget entries remain year/month scoped.
// Stable IDs allow renaming without rewriting historical transactions.
export const BUILTIN_EXPENSE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'fixed', name: 'Fixed Expenses', builtin: true }),
  Object.freeze({ id: 'variable', name: 'Variable & One-Time Expenses', builtin: true })
]);

export function normalizeExpenseCategories(rows = []) {
  if (!Array.isArray(rows)) throw new Error('Expense categories must be an array');
  const seenIds = new Set(BUILTIN_EXPENSE_CATEGORIES.map(category => category.id));
  const seenNames = new Set(BUILTIN_EXPENSE_CATEGORIES.map(category => category.name.toLocaleLowerCase()));
  return rows.map(row => {
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || seenIds.has(id)) {
      throw new Error('Expense category IDs must be unique and valid');
    }
    if (!name || name.length > 80 || seenNames.has(name.toLocaleLowerCase())) {
      throw new Error('Expense category names must be nonblank and unique');
    }
    seenIds.add(id);
    seenNames.add(name.toLocaleLowerCase());
    return { id, name, builtin: false };
  });
}

export function createExpenseCategory(categories, category) {
  return normalizeExpenseCategories([...categories, category]);
}

export function renameExpenseCategory(categories, id, name) {
  if (!categories.some(category => category.id === id)) throw new Error('Expense category not found');
  return normalizeExpenseCategories(categories.map(category =>
    category.id === id ? { ...category, name } : category));
}

// Fail closed: deletion requires a complete owner-scoped inventory of saved years
// and global recurring rules. The caller must verify those reads succeeded.
export function canDeleteExpenseCategory(id, yearDocuments, recurringRules) {
  if (!id || BUILTIN_EXPENSE_CATEGORIES.some(category => category.id === id)) return false;
  if (!yearDocuments || typeof yearDocuments !== 'object' ||
      !Array.isArray(recurringRules)) return false;
  if (recurringRules.some(rule => rule?.categoryId === id || rule?.category_id === id ||
      rule?.category === id || rule?.versions?.some(version =>
        version?.categoryId === id || version?.category_id === id || version?.category === id))) return false;
  return !Object.values(yearDocuments).some(year =>
    !Array.isArray(year?.months) || year.months.some(month =>
      !month || (month.expenses !== undefined && !Array.isArray(month.expenses)) ||
      (Array.isArray(month.expenses) && month.expenses.some(entry => entry?.categoryId === id || entry?.category_id === id)) ||
      ['fixed', 'variable'].some(kind =>
        !Array.isArray(month[kind]) || month[kind].some(entry => entry?.categoryId === id || entry?.category_id === id))));
}
