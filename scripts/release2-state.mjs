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
  const resolve = (row, idKey, indexKey, targets) => {
    if (Object.hasOwn(row, idKey)) return targets.some(t => t.id === row[idKey]) ? row[idKey] : null;
    const i = row[indexKey];
    return Number.isInteger(i) && i >= 0 && i < targets.length ? targets[i].id : null;
  };
  const expenses = list(m.expenses).map(value => {
    const row = object(value) ? value : {};
    const out = { ...row, amount: money(row.amount), paycheckId: resolve(row, 'paycheckId', 'paycheckIndex', paychecks), excludedBucketId: resolve(row, 'excludedBucketId', 'excludedBucketIndex', excludedBuckets) };
    delete out.paycheckIndex;
    delete out.excludedBucketIndex;
    return out;
  });
  return { ...m, paychecks, excludedBuckets, expenses };
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
