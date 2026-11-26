import { RESERVED_CATEGORY_IDS } from './expense-category-model.mjs';
import { dueDayOf } from './due-day.mjs';

// Validate owner-scoped recurring definitions without altering budget transactions.
export const FREQUENCY_MONTHS = Object.freeze({
  monthly: 1, 'every-2-months': 2, quarterly: 3,
  'every-6-months': 6, annually: 12
});
const CATEGORIES = new Set(RESERVED_CATEGORY_IDS);
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function validMonthDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function normalizeRecurringRule(rule, { expenseCategoryIds = [] } = {}) {
  if (!rule || typeof rule !== 'object') throw new TypeError('Rule required');
  const id = typeof rule.id === 'string' ? rule.id.trim() : '';
  if (!id || id.length > 256) throw new Error('Stable rule identifier required');
  const startDate = rule.startDate;
  if (!validMonthDate(startDate)) throw new Error('Invalid start date');
  const endDate = rule.endDate ?? null;
  if (endDate !== null && (!validMonthDate(endDate) || endDate < startDate)) throw new Error('Invalid end date');
  const frequency = rule.frequency ?? 'monthly';
  if (!Object.hasOwn(FREQUENCY_MONTHS, frequency)) throw new Error('Unsupported recurring frequency');
  const category = rule.category;
  if (!Array.isArray(expenseCategoryIds) || expenseCategoryIds.some(id =>
    typeof id !== 'string' || CATEGORIES.has(id) || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))) {
    throw new Error('Invalid recurring expense category catalog');
  }
  if (!CATEGORIES.has(category) && !expenseCategoryIds.includes(category)) {
    throw new Error('Unsupported recurring category');
  }
  const amount = rule.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('Invalid recurring amount');
  const name = typeof rule.name === 'string' ? rule.name.trim() : '';
  if (!name) throw new Error('Rule name required');
  const dueDay = dueDayOf(rule) ?? Number(startDate.slice(8, 10));
  const accountId = rule.accountId || null;
  return {
    id, name, category, amount, dueDay, accountId,
    frequency, startDate, endDate, active: rule.active !== false,
    versions: [{ effectiveFrom: startDate.slice(0, 7) + '-01', name, amount, dueDay, accountId, frequency }]
  };
}

