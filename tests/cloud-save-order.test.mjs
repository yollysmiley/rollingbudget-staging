import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const start = html.indexOf('const cloudSaveQueues = new Map();');
const end = html.indexOf('function switchYear(yr)', start);
assert(start >= 0 && end > start, 'Cloud save implementation must be present');

function harness() {
  const writes = [];
  const store = new Map();
  const status = { textContent: '', hidden: true, setAttribute() {}, style: {}, replaceChildren(node) { this.textContent = node.textContent; }, append() {} };
  const document = {
    getElementById: () => status,
    querySelector: () => ({ insertAdjacentElement() {} }),
    createElement: () => ({ textContent: '', onclick: null }),
    createTextNode: value => ({ textContent: value })
  };
  const context = {
    Map, Promise, JSON, Date, Number, console, document,
    localStorage: { setItem: (key, value) => store.set(key, value),
      getItem: key => store.get(key) ?? null, removeItem: key => store.delete(key) },
    storageKey: year => 'owner_budget_' + year,
    db: { '2026': { months: [{ income: [{ cpm: 100 }] }] } },
    activeYear: '2026',
    currentUser: { id: 'owner' },
    supabaseClient: { from: () => ({
      insert: row => new Promise(resolve => writes.push({ row, resolve })),
      update: row => {
        const filters = {};
        const query = {
          eq(field, value) { filters[field] = value; return query; },
          select() { return new Promise(resolve => writes.push({ row, filters, resolve })); }
        };
        return query;
      }
    }) },
    alert: () => { throw new Error('unexpected local storage failure'); }
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  return { context, writes, store, status };
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test('consecutive edits save immutable snapshots in order', async () => {
  const { context, writes } = harness();
  const first = vm.runInContext('saveDB()', context);
  context.db['2026'].months[0].income[0].cpm = 4321.25;
  const second = vm.runInContext('saveDB()', context);
  await flush();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].row.budget_data.months[0].income[0].cpm, 100);
  writes[0].resolve({ error: null });
  await flush();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].row.budget_data.months[0].income[0].cpm, 4321.25);
  assert.equal(writes[1].filters.updated_at, writes[0].row.updated_at);
  writes[1].resolve({ data: [{ year: 2026 }], error: null });
  await Promise.all([first, second]);
});
test('failed cloud save retains local snapshot and shows warning', async () => {
  const { context, writes, store, status } = harness();
  const saving = vm.runInContext('saveDB()', context);
  await flush();
  writes[0].resolve({ error: { message: 'synthetic error' } });
  await saving;
  assert.equal(JSON.parse(store.get('owner_budget_2026')).data.months[0].income[0].cpm, 100);
  assert.match(status.textContent, /Cloud save rejected or unavailable/);
  assert.equal(status.hidden, false);
  assert.equal(store.get('owner_budget_2026_cloud_conflict'), '1');
});

test('stale revision rejects cloud write without losing local snapshot', async () => {
  const { context, writes, store, status } = harness();
  vm.runInContext("cloudBudgetVersions.set('owner:2026', '2026-01-01T00:00:00.000Z')", context);
  const saving = vm.runInContext('saveDB()', context);
  await flush();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filters.updated_at, '2026-01-01T00:00:00.000Z');
  writes[0].resolve({ data: [], error: null });
  assert.equal(await saving, 'local-saved');
  assert.equal(JSON.parse(store.get('owner_budget_2026')).data.months[0].income[0].cpm, 100);
  assert.match(status.textContent, /Cloud save rejected/);
});

test('unresolved conflict prevents another cloud write and retains the local copy', async () => {
  const { context, writes, store } = harness();
  vm.runInContext("cloudBudgetVersions.set('owner:2026', '2026-01-01T00:00:00.000Z')", context);
  const first = vm.runInContext('saveDB()', context);
  await flush();
  writes[0].resolve({ data: [], error: null });
  await first;
  context.db['2026'].months[0].income[0].cpm = 250;
  assert.equal(await vm.runInContext('saveDB()', context), 'local-saved');
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(store.get('owner_budget_2026')).data.months[0].income[0].cpm, 250);
  assert.equal(store.get('owner_budget_2026_cloud_conflict'), '1');
});
