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
  const status = { textContent: '', hidden: true, setAttribute() {}, style: {} };
  const document = {
    getElementById: () => status,
    querySelector: () => ({ insertAdjacentElement() {} }),
    createElement: () => status
  };
  const context = {
    Map, Promise, JSON, Date, Number, console, document,
    localStorage: { setItem: (key, value) => store.set(key, value) },
    storageKey: year => 'owner_budget_' + year,
    db: { '2026': { months: [{ income: [{ cpm: 100 }] }] } },
    activeYear: '2026',
    currentUser: { id: 'owner' },
    supabaseClient: { from: () => ({ upsert: row => new Promise(resolve => writes.push({ row, resolve })) }) },
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
  writes[1].resolve({ error: null });
  await Promise.all([first, second]);
});
test('failed cloud save retains local snapshot and shows warning', async () => {
  const { context, writes, store, status } = harness();
  const saving = vm.runInContext('saveDB()', context);
  await flush();
  writes[0].resolve({ error: { message: 'synthetic error' } });
  await saving;
  assert.equal(JSON.parse(store.get('owner_budget_2026')).data.months[0].income[0].cpm, 100);
  assert.match(status.textContent, /Cloud sync failed/);
  assert.equal(status.hidden, false);
});
