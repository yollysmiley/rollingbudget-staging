// Expense category definitions are owner-global; budget entries remain year/month scoped.
// Stable IDs allow renaming without rewriting historical transactions.
export const BUILTIN_EXPENSE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'fixed', name: 'Fixed Expenses', builtin: true }),
  Object.freeze({ id: 'variable', name: 'Variable & One-Time Expenses', builtin: true })
]);

export const RESERVED_CATEGORY_IDS = Object.freeze(['income', 'fixed', 'variable', 'loan', 'cc']);

export function normalizeExpenseCategories(rows = []) {
  if (!Array.isArray(rows)) throw new Error('Expense categories must be an array');
  const seenIds = new Set(RESERVED_CATEGORY_IDS);
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

// Mirror the database reference contract; deletion authorization remains server-side.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireObject(value) { if (!object(value)) throw new Error('Invalid reference object'); }
function requireArray(value) { if (!Array.isArray(value)) throw new Error('Invalid reference collection'); }
function collectFields(item, fields, builtins, refs) {
  requireObject(item);
  for (const field of fields) {
    if (!Object.hasOwn(item, field)) continue;
    const id = item[field];
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid category reference');
    if (!builtins.includes(id)) refs.add(id);
  }
}
export function extractRuleCategoryRefs(items, refs = new Set()) {
  requireArray(items);
  for (const item of items) {
    collectFields(item, ['category','categoryId','category_id'], RESERVED_CATEGORY_IDS, refs);
    if (Object.hasOwn(item,'versions')) extractRuleCategoryRefs(item.versions, refs);
  }
  return refs;
}
export function extractBudgetCategoryRefs(document) {
  requireObject(document);
  const refs = new Set();
  if (Object.hasOwn(document,'recurringRules')) extractRuleCategoryRefs(document.recurringRules, refs);
  if (!Object.hasOwn(document,'months')) return refs;
  requireArray(document.months);
  for (const month of document.months) {
    requireObject(month);
    for (const collection of ['expenses','fixed','variable']) {
      if (!Object.hasOwn(month,collection)) continue;
      requireArray(month[collection]);
      for (const entry of month[collection]) {
        requireObject(entry);
        const camel = Object.hasOwn(entry,'categoryId'), snake = Object.hasOwn(entry,'category_id');
        if (collection === 'expenses' && !camel && !snake) throw new Error('Missing expense category');
        if (camel && snake && entry.categoryId !== entry.category_id) throw new Error('Conflicting expense category aliases');
        collectFields(entry,['categoryId','category_id'],['fixed','variable'],refs);
      }
    }
  }
  return refs;
}
export function canDeleteExpenseCategory(id, yearDocuments, recurringRules) {
  if (!id || RESERVED_CATEGORY_IDS.includes(id)) return false;
  try {
    requireObject(yearDocuments);
    return !extractRuleCategoryRefs(recurringRules).has(id) &&
      !Object.values(yearDocuments).some(year => extractBudgetCategoryRefs(year).has(id));
  } catch { return false; }
}
