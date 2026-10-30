import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const runtime = readFileSync(new URL('./release2-runtime.js', import.meta.url), 'utf8');
const module = readFileSync(new URL('./release2-state.mjs', import.meta.url), 'utf8').replace(/^export /gm, '');
const storage = new Map();
const buttons = [], blobs = [], alerts = [];
let writes = 0;
const node = () => ({ remove() {}, replaceChildren() {}, append() {}, addEventListener(event, handler) { this[event] = handler; }, classList: { remove() {} }, setAttribute() {}, textContent: '' });
const context = vm.createContext({
    crypto: webcrypto, console, Blob,
    setTimeout() {},
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:recovery-test'; }, revokeObjectURL() {} },
    alert: message => alerts.push(message),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { writes++; storage.set(key, value); } },
    document: {
        getElementById: () => node(),
        createElement(tag) { const element = node(); if (tag === 'button') buttons.push(element); if (tag === 'a') element.click = () => {}; return element; },
        createTextNode: value => value,
        body: { prepend() {} }
    }
});
const run = code => vm.runInContext(code, context);
run(`const RB2_PREFIX = 'rollingbudget_staging_test'; const RB2 = (() => { ${module}; return { normalizeMonth, deleteEntity, createAccountStore }; })(); const MONTHS = Array.from({length:12},(_,i)=>String(i)); ${runtime}`);
run("rb2Account = null; state.recurring.push({name:'unsaved-draft-marker',amount:5}); rb2Notice('Export your draft before reloading.');");
buttons.at(-1).click();
assert.equal(alerts.length, 0);
const firstBlob = blobs.at(-1);
const first = JSON.parse(await firstBlob.text());
assert.equal(first.draft.schemaVersion, 2);
assert.equal(first.draft.data.recurring[0].name, 'unsaved-draft-marker');
assert.equal(first.draft.data.recurring[0].amount, 5);
assert.equal(first.current, null);
assert.equal(first.accountId, null);
assert.equal(first.formatVersion, 1);
assert.ok(Number.isFinite(Date.parse(first.exportedAt)));
console.log('PASS: guest unsaved draft and versioned export metadata');
run("state.recurring[0].name = 'later-edit';");
assert.equal(JSON.parse(await firstBlob.text()).draft.data.recurring[0].name, 'unsaved-draft-marker');
console.log('PASS: exported snapshot is unaffected by later edits');
storage.set('rollingbudget_staging_test:release2:account:A', '{malformed-original');
storage.set('rollingbudget_staging_test_rollover_pro_v5', 'legacy-original');
run("rb2Account = 'A'; rb2CloudRecovery = {years:'malformed-cloud'}; rb2Notice('Recovery required.');");
buttons.at(-1).click();
const account = JSON.parse(await blobs.at(-1).text());
assert.equal(account.accountId, 'A');
assert.equal(account.draft.data.recurring[0].name, 'later-edit');
console.log('PASS: account export captures current account and latest draft');
assert.equal(account.current, '{malformed-original');
assert.equal(account.legacy.rollingbudget_staging_test_rollover_pro_v5, 'legacy-original');
assert.deepEqual(account.cloud, {years:'malformed-cloud'});
console.log('PASS: original local, legacy and cloud recovery data preserved');
assert.equal(writes, 0);
assert.equal(storage.get('rollingbudget_staging_test:release2:account:A'), '{malformed-original');
console.log('PASS: recovery export performs no storage writes');
