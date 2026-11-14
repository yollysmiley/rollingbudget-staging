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
test('account manager is initialized after authenticated year loading', () => {
  assert.match(html, /await loadAllYears\(\);\s*await initializeAccounts\(\);\s*render\(\);/);
});
test('browser service modules are published to both staging app routes', () => {
  assert.match(build, /dist\/scripts/);
  assert.match(build, /dist\/app\/scripts/);
  assert.match(html, /import\('\.\/scripts\/account-storage\.mjs'\)/);
});
test('account manager does not modify financial calculations during phase 2', () => {
  assert.match(html, /const cpmIncome = m\.income\.reduce/);
  assert.match(html, /const usaaIncome = m\.income\.reduce/);
});
