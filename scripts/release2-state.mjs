export const VERSION = 2;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = v => Array.isArray(v) ? v : [];
const money = v => { const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : 0; };
export function normalizeMonth(input, makeId = () => crypto.randomUUID()) {
  const m = object(input) ? input : {};
  function entities(values) {
    const seen = new Set();
    return list(values).map(value => {
      const row = object(value) ? value : {};
      let id = typeof row.id === 'string' && row.id ? row.id : makeId();
      if (seen.has(id)) throw new Error('Duplicate entity ID');
      seen.add(id);
      return { ...row, id, amount: money(row.amount) };
    });
  }
  const paychecks = entities(m.paychecks);
  const excludedBuckets = entities(m.excludedBuckets);

  const resolveLegacyReference = (value, targets) => {
    if (Number.isInteger(value) && value >= 0 && value < targets.length) {
      return targets[value].id;
    }
    if (typeof value === 'string' && value.startsWith('excl_')) {
      const index = Number.parseInt(value.slice(5), 10);
      if (Number.isInteger(index) && index >= 0 && index < targets.length) {
        return targets[index].id;
      }
    }
    return null;
  };

  const resolve = (row, idKey, indexKey, legacyKey, targets) => {
    if (Object.hasOwn(row, idKey)) return targets.some(t => t.id === row[idKey]) ? row[idKey] : null;

    const explicit = row[indexKey];
    if (Object.hasOwn(row, legacyKey)) {
      return resolveLegacyReference(row[legacyKey], targets);
    }
    if (Number.isInteger(explicit) || typeof explicit === 'string') {
      return resolveLegacyReference(explicit, targets);
    }
    return null;
  };

  const expenses = list(m.expenses).map(value => {
    const row = object(value) ? value : {};
    const out = {
      ...row,
      amount: money(row.amount),
      paycheckId: resolve(row, 'paycheckId', 'paycheckIndex', 'bucketIndex', paychecks),
      excludedBucketId: resolve(row, 'excludedBucketId', 'excludedBucketIndex', 'bucketIndex', excludedBuckets)
    };
    delete out.paycheckIndex;
    delete out.excludedBucketIndex;
    delete out.bucketIndex;
    return out;
  });

  return { ...m, paychecks, excludedBuckets, expenses };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function normalizeState(raw, makeId = () => crypto.randomUUID()) {
  if (!object(raw)) throw new Error('Budget state must be an object');
  if (Object.hasOwn(raw, 'release2Version') && raw.release2Version !== VERSION) {
    throw new Error('Unsupported Release 2 state version');
  }
  if (Object.hasOwn(raw, 'years') && !Array.isArray(raw.years)) throw new Error('Invalid years');
  if (Array.isArray(raw.years) && raw.years.length === 0) throw new Error('Budget state must contain at least one year');

  const currentYear = new Date().getFullYear();
  const sourceYears = Array.isArray(raw.years) ? raw.years : [{
    year: String(currentYear),
    activeMonth: 0,
    months: MONTH_NAMES.map(name => ({ name, paychecks: [{ name: 'Paycheck 1', amount: 2500, date: '' }], expenses: [], excludedBuckets: [] }))
  }];

  const years = sourceYears.map((value, yearIndex) => {
    if (!object(value)) throw new Error('Invalid year at index ' + yearIndex);
    if (Object.hasOwn(value, 'months') && !Array.isArray(value.months)) throw new Error('Invalid months for year ' + yearIndex);
    const sourceMonths = Array.isArray(value.months) ? value.months : [];
    if (sourceMonths.length > 12) throw new Error('A year cannot contain more than 12 months');
    const months = MONTH_NAMES.map((name, monthIndex) => {
      const candidate = sourceMonths[monthIndex];
      if (candidate === undefined) {
        return normalizeMonth({
          name,
          paychecks: [{ name: 'Paycheck 1', amount: 2500, date: '' }],
          expenses: [],
          excludedBuckets: []
        }, makeId);
      }
      if (!object(candidate)) throw new Error('Invalid month at year ' + yearIndex + ', month ' + monthIndex);
      for (const key of ['paychecks', 'expenses', 'excludedBuckets']) {
        if (Object.hasOwn(candidate, key) && !Array.isArray(candidate[key])) {
          throw new Error('Invalid ' + key + ' in month ' + monthIndex);
        }
      }
      return normalizeMonth({ ...candidate, name: candidate.name ?? name }, makeId);
    });
    const requestedMonth = Number.isInteger(value.activeMonth) ? value.activeMonth : 0;
    return { ...value, activeMonth: Math.min(11, Math.max(0, requestedMonth)), months };
  });

  const requestedYear = Number.isInteger(raw.activeYearIndex) ? raw.activeYearIndex : 0;
  return {
    ...raw,
    activeYearIndex: Math.min(years.length - 1, Math.max(0, requestedYear)),
    recurring: Array.isArray(raw.recurring) ? raw.recurring.map((item, index) => {
      if (!object(item)) throw new Error('Invalid recurring item at index ' + index);
      return { ...item, amount: money(item.amount) };
    }) : [{ name: 'Housing/Rent', amount: 1500, category: 'Housing', dueDay: 1 }],
    years
  };
}

export function deleteEntity(month, kind, id) {
  if (!['paychecks', 'excludedBuckets'].includes(kind)) throw new Error('Invalid entity kind');
  const reference = kind === 'paychecks' ? 'paycheckId' : 'excludedBucketId';
  return { ...month, [kind]: month[kind].filter(row => row.id !== id), expenses: month.expenses.map(row => row[reference] === id ? { ...row, [reference]: null } : { ...row }) };
}
export function createAccountStore(storage, prefix) {
  if (typeof prefix !== 'string' || !prefix.startsWith('rollingbudget_staging_')) throw new Error('Staging prefix required');
  let account = null;
  let generation = 0;
  const key = () => prefix + ':release2:' + (account === null ? 'guest' : 'account:' + encodeURIComponent(account));
  return {
    switchAccount(id) {
      if (id !== null && (typeof id !== 'string' || !id)) throw new Error('Invalid account ID');
      account = id;
      generation++;
      return generation;
    },
    token() { return generation; },
    isCurrent(token) { return token === generation; },
    load(validate) {
      try {
        const raw = storage.getItem(key());
        if (raw === null) return { status: 'empty', value: null };
        const parsed = JSON.parse(raw);
        if (!object(parsed) || parsed.schemaVersion !== VERSION) throw new Error('Unsupported state version');
        return { status: 'ok', value: validate(parsed.data) };
      } catch (error) { return { status: 'recovery-required', value: null, error: String(error) }; }
    },
    save(data, validate, token) {
      if (token !== generation) throw new Error('Stale account operation');
      const value = validate(data);
      const existing = storage.getItem(key());
      if (existing !== null) {
        try {
          const parsed = JSON.parse(existing);
          if (!object(parsed) || parsed.schemaVersion !== VERSION) throw new Error('Unsupported state version');
          validate(parsed.data);
        } catch { throw new Error('Recovery required before overwriting saved data'); }
      }
      storage.setItem(key(), JSON.stringify({ schemaVersion: VERSION, data: value }));
      return value;
    }
  };
}
