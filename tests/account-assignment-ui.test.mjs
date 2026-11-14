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
test('income keeps historical values and offers only account-based new income', () => {
  assert.doesNotMatch(html, /id="newIncCpm"/);
  assert.doesNotMatch(html, /id="newIncUsaa"/);
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

test('legacy income migrates before rendering without a manual split action', () => {
  assert.match(html, /async function migrateLoadedIncome\(\)/);
  assert.match(html, /await migrateLoadedIncome\(\)/);
  assert.doesNotMatch(html, /function splitLegacyIncome\(/);
  assert.doesNotMatch(html, /Split income/);
});
test('account selection is shown for every recurring category', () => {
  assert.match(html, /function toggleRecFields\(\)\{document\.querySelectorAll/);
  assert.match(html, /group\.style\.display="grid"/);
});
test('secondary authenticated load initializes accounts before rendering', () => {
  assert.match(html, /await loadAllYears\(\);\s*if \(currentUser\) await initializeAccounts\(\);\s*render\(\);/);
});
