import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('../auth-confirmation.html', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build-staging.mjs', import.meta.url), 'utf8');

test('new signups send Supabase confirmation links to the hosted confirmation page', () => {
  assert.match(app, /new URL\("\.\/auth-confirmation\.html", window\.location\.href\)\.href/);
  assert.match(app, /auth\.signUp\(\{ email, password, options: \{ emailRedirectTo \} \}\)/);
});

test('confirmation page uses the same staging auth storage namespace and lets Supabase parse the link', () => {
  assert.match(page, /STAGING_STORAGE_PREFIX \+ "_auth"/);
  assert.match(page, /client\.auth\.getSession\(\)/);
  assert.match(page, /window\.location\.hash/);
  assert.match(build, /dist\/auth-confirmation\.html/);
});

test('confirmation page exposes success and safe invalid or expired link states', () => {
  assert.match(page, /Your email is confirmed/);
  assert.match(page, /This link is invalid or has expired/);
  assert.match(page, /Continue to Rolling Budget/);
  assert.match(page, /request a new confirmation email/);
  assert.doesNotMatch(page, /error\.message/);
});
