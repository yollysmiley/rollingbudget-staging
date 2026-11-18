import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('rollover-budget-app.html', 'utf8');
const homepage = readFileSync('index.html', 'utf8');
const live = readFileSync('tests/live/authenticated.spec.js', 'utf8');

test('UI sign-out waits for session revocation before navigating', () => {
  const start = app.indexOf('async function handleAuthClick()');
  const end = app.indexOf('function closeAuthModal()', start);
  assert.ok(start >= 0 && end > start);
  const handler = app.slice(start, end);
  assert.match(handler, /await supabaseClient\.auth\.signOut\(\)/);
  assert.match(handler, /if \(error\) throw error/);
  assert.ok(handler.indexOf('await supabaseClient.auth.signOut()') < handler.indexOf('window.location.replace(home)'));
  assert.match(app, /if \(!uiSignOutInProgress\) window\.location\.replace\(home\)/);
});

test('live logout asserts actual public homepage and absence of the prior session', () => {
  assert.match(homepage, /id="publicHeadline"/);
  assert.match(live, /locator\('#publicHeadline'\)/);
  assert.match(live, /locator\('#rbDialogCancel'\)\.click\(\)/);
  assert.match(live, /locator\('#rbDialogAccept'\)\.click\(\)/);
  assert.match(live, /toHaveURL\(\/\^http:/);
  assert.doesNotMatch(live, /toHaveURL\(\/\\\/\$\/\)/);
  assert.match(live, /localStorage\.getItem\(key\)/);
  assert.match(live, /await page\.goto\('\/app\/'\)/);
});
