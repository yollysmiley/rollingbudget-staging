import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('../reset-password.html', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build-staging.mjs', import.meta.url), 'utf8');

test('forgot-password requests redirect to the dedicated reset page', () => {
  assert.match(app, /new URL\("\.\/reset-password\.html", window\.location\.href\)\.href/);
  assert.match(app, /resetPasswordForEmail\(email, \{ redirectTo \}\)/);
});

test('reset page uses the isolated staging auth namespace and requires a recovery event', () => {
  assert.match(page, /STAGING_STORAGE_PREFIX \+ "_auth"/);
  assert.match(page, /detectSessionInUrl: true/);
  assert.match(page, /event === "PASSWORD_RECOVERY"/);
  assert.match(page, /if \(!recoveryEventSeen\)/);
  assert.match(page, /recoveryCheckTimer = setTimeout/);
  assert.match(page, /auth\.verifyOtp\(\{ token_hash: tokenHash, type: "recovery" \}\)/);
  assert.match(page, /supabaseClient\.auth\.getSession\(\)/);
  assert.match(build, /dist\/reset-password\.html/);
});

test('reset page validates passwords and updates only through the authenticated Supabase session', () => {
  assert.match(page, /password\.length < 8/);
  assert.match(page, /password !== confirmation/);
  assert.match(page, /auth\.updateUser\(\{ password \}\)/);
  assert.match(page, /Your password has been updated/);
  assert.match(page, /This reset link is invalid or has expired/);
  assert.doesNotMatch(page, /error\.message/);
});
