import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build-staging.mjs', import.meta.url), 'utf8');

test('desktop and mobile use distinct account manager containers', () => {
  assert.match(html, /id="desktopAccountsManager"/);
  assert.match(html, /id="mobileSettingsAccounts"/);
  assert.match(html, /id="mobileSettingsPanel"/);
  assert.match(html, /function renderAccounts\(\)/);
});
test('account manager finishes loading before initial budget render and auth gate reveal', () => {
  const init = html.slice(html.indexOf('async function initApp() {'), html.indexOf('function parseLocalBudgetRecord('));
  const yearLoad = init.lastIndexOf('await loadAllYears();');
  const catalogLoad = init.lastIndexOf('const ready = await initializeAccounts();');
  const render = init.lastIndexOf('render();');
  const reveal = init.lastIndexOf('document.documentElement.classList.add("budget-authenticated");');
  assert.ok(yearLoad >= 0 && yearLoad < catalogLoad && catalogLoad < render && render < reveal);
  assert.match(init, /if \(!ready \|\| currentUser\?\.id !== user\.id\)/);
});
test('browser service modules are published to both staging app routes', () => {
  assert.match(build, /dist\/scripts/);
  assert.match(build, /dist\/app\/scripts/);
  assert.match(html, /import\('\.\/scripts\/account-storage\.mjs'\)/);
});
test('account-aware budget totals are calculated only after accounts load', () => {
  assert.match(html, /accountBudgetModule = await import\('\.\/scripts\/account-budget\.mjs'\)/);
  assert.match(html, /accountBudgetModule\.computeAccountBudget\(db\[yrKey\], budgetAccounts\)/);
  assert.match(html, /accountStatus\('Account changes saved\.'\);\s*render\(\)/);
});
