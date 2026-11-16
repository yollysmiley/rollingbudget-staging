// Canonical expense due dates are nullable integer days, never display strings.
export const EXPENSE_DUE_TYPES = Object.freeze(['fixed', 'variable', 'creditCards', 'loans']);

export function parseDueDay(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Number.isInteger(value) && value >= 1 && value <= 31) return value;
  if (typeof value === 'string') {
    const match = /^([1-9]|[12]\d|3[01])(?:st|nd|rd|th)?$/i.exec(value.trim());
    if (match) return Number(match[1]);
    if (value.trim() === '') return null;
  }
  throw new RangeError('Due day must be an integer between 1 and 31');
}

export function dueDayOf(entry) {
  if (!entry || typeof entry !== 'object') throw new TypeError('Expense entry required');
  const current = parseDueDay(entry.dueDay);
  const legacy = parseDueDay(entry.due);
  if (current !== null && legacy !== null && current !== legacy) {
    throw new Error('Conflicting due day values require review');
  }
  return current ?? legacy;
}

// Read-only normalization: valid legacy ordinals become integers, while any
// unrecognized original is preserved for explicit user correction.
export function migrateYearDueDays(year) {
  if (!year || !Array.isArray(year.months) || year.months.length !== 12) {
    throw new TypeError('Twelve budget months required');
  }
  let result = null;
  const unrecognized = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const month = year.months[monthIndex];
    for (const type of EXPENSE_DUE_TYPES) {
      if (!Array.isArray(month?.[type])) throw new TypeError('Invalid expense category: ' + type);
      month[type].forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') throw new TypeError('Invalid expense entry');
        if (!Object.hasOwn(entry, 'due') && !Object.hasOwn(entry, 'dueDay')) return;
        let day;
        try { day = dueDayOf(entry); }
        catch (error) {
          unrecognized.push({ monthIndex, type, index, value: entry.dueDay ?? entry.due });
          return;
        }
        if (!Object.hasOwn(entry, 'due') && entry.dueDay === day) return;
        if (!result) result = structuredClone(year);
        const migrated = result.months[monthIndex][type][index];
        delete migrated.due;
        migrated.dueDay = day;
      });
    }
  }
  return { year: result || year, changed: Boolean(result), unrecognized };
}

export function calendarDueDay(year, monthIndex, dueDay) {
  const day = parseDueDay(dueDay);
  if (day === null || !Number.isInteger(year) || year < 1900 || year > 2200 ||
      !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new RangeError('Valid year, month, and due day required');
  }
  return Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}
