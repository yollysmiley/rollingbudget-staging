import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');

test('each expense and debt entry supports account reassignment', () => {
  for (const type of ['fixed', 'variable', 'loans', 'creditCards']) {
    assert.ok(html.includes('accountPicker("'+type+'"') || html.includes("accountPicker('"+type+"'"));
  }
  for (const prefix of ['newFix','newVar','newLoan','newCc','newInc']) {
    assert.match(html, new RegExp('id="'+prefix+'Account" data-new-entry-account'));
  }
});
test('income keeps legacy columns and offers new account amount', () => {
  assert.match(html, /id="newIncCpm"/);
  assert.match(html, /id="newIncUsaa"/);
  assert.match(html, /id="newIncAmount"/);
  assert.match(html, /income\.push\(\{ name, accountId, amount \}\)/);
});
test('recurring rule items carry account identity across categories', () => {
  assert.match(html, /const accountId = r\.accountId \|\| r\.acct \|\| null/);
  assert.match(html, /accountId:acct,startMonth,frequency/);
  assert.match(html, /refreshAccountSelectors\(\);/);
});
test('account selectors reject IDs absent from authenticated account list', () => {
  assert.match(html, /accountId && !budgetAccounts\.some\(a => a\.id === accountId\)/);
});
