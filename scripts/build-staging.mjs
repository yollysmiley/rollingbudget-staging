import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../staging-config.json', import.meta.url), 'utf8'));
assert.equal(config.environment, 'staging');
assert.equal(config.projectRef, 'phiscfwfuzeptetimdbo');
assert.equal(config.supabaseUrl, 'https://phiscfwfuzeptetimdbo.supabase.co');
assert.match(config.publishableKey, /^sb_publishable_[A-Za-z0-9_-]+$/);
assert.equal(config.storagePrefix, 'rollingbudget_staging_phiscfwfuzeptetimdbo');

let html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
function replaceOnce(oldValue, replacement, label) {
  assert.equal(html.split(oldValue).length, 2, label + ': expected one source match');
  html = html.replace(oldValue, replacement);
}
replaceOnce('const SUPABASE_URL = "YOUR_SUPABASE_URL";', 'const SUPABASE_URL = ' + JSON.stringify(config.supabaseUrl) + ';', 'Supabase URL');
replaceOnce('const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";', 'const SUPABASE_ANON_KEY = ' + JSON.stringify(config.publishableKey) + ';', 'Supabase publishable key');
replaceOnce('const STAGING_STORAGE_PREFIX = "YOUR_STAGING_STORAGE_PREFIX";', 'const STAGING_STORAGE_PREFIX = ' + JSON.stringify(config.storagePrefix) + ';', 'Storage namespace');
replaceOnce('<title>Rolling Budget</title>', '<title>STAGING - Rolling Budget</title>', 'Page title');
replaceOnce('<body>', '<body>\n  <aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">STAGING ONLY — isolated from production — legacy budget records are preserved separately and are not imported into this UI — ' + config.projectRef + '</aside>', 'Staging banner');

assert.ok(html.includes('function storageKey(year)'), 'Account-scoped storage is missing');
assert.ok(html.includes('from("budget_ui_years").select("year,budget_data,updated_at")'), 'Cloud data loading is missing');
assert.ok(html.includes('from("budget_ui_years").upsert('), 'Cloud data saving is missing');
assert.ok(!html.includes('YOUR_SUPABASE_'), 'Unconfigured Supabase placeholder remains');
assert.ok(!html.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Unconfigured storage placeholder remains');
assert.ok(!html.includes('awalptqpsjflrahkrjzk'), 'Production project reference remains');
assert.ok(!html.includes('sb_secret_'), 'Secret key marker found');
assert.ok(!html.includes('localStorage.removeItem('), 'Build must not delete browser data');
assert.ok(html.includes('function esc(str)') && html.includes('&lt;'), 'HTML text escaping is missing');

let confirmationHtml = readFileSync(new URL('../auth-confirmation.html', import.meta.url), 'utf8');
function replaceConfirmationOnce(oldValue, replacement, label) {
  assert.equal(confirmationHtml.split(oldValue).length, 2, label + ': expected one source match');
  confirmationHtml = confirmationHtml.replace(oldValue, replacement);
}
replaceConfirmationOnce('const SUPABASE_URL = "YOUR_SUPABASE_URL";', 'const SUPABASE_URL = ' + JSON.stringify(config.supabaseUrl) + ';', 'Confirmation Supabase URL');
replaceConfirmationOnce('const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";', 'const SUPABASE_ANON_KEY = ' + JSON.stringify(config.publishableKey) + ';', 'Confirmation publishable key');
replaceConfirmationOnce('const STAGING_STORAGE_PREFIX = "YOUR_STAGING_STORAGE_PREFIX";', 'const STAGING_STORAGE_PREFIX = ' + JSON.stringify(config.storagePrefix) + ';', 'Confirmation storage namespace');
replaceConfirmationOnce('<title>Confirm your Rolling Budget email</title>', '<title>STAGING - Confirm your Rolling Budget email</title>', 'Confirmation page title');
replaceConfirmationOnce('<body>', '<body>\n  <aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">STAGING ONLY — isolated from production — ' + config.projectRef + '</aside>', 'Confirmation staging banner');
assert.ok(!confirmationHtml.includes('YOUR_SUPABASE_'), 'Confirmation page has an unconfigured Supabase placeholder');
assert.ok(!confirmationHtml.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Confirmation page has an unconfigured storage placeholder');

let resetHtml = readFileSync(new URL('../reset-password.html', import.meta.url), 'utf8');
function replaceResetOnce(oldValue, replacement, label) {
  assert.equal(resetHtml.split(oldValue).length, 2, label + ': expected one source match');
  resetHtml = resetHtml.replace(oldValue, replacement);
}
replaceResetOnce('const SUPABASE_URL = "YOUR_SUPABASE_URL";', 'const SUPABASE_URL = ' + JSON.stringify(config.supabaseUrl) + ';', 'Reset Supabase URL');
replaceResetOnce('const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";', 'const SUPABASE_ANON_KEY = ' + JSON.stringify(config.publishableKey) + ';', 'Reset publishable key');
replaceResetOnce('const STAGING_STORAGE_PREFIX = "YOUR_STAGING_STORAGE_PREFIX";', 'const STAGING_STORAGE_PREFIX = ' + JSON.stringify(config.storagePrefix) + ';', 'Reset storage namespace');
replaceResetOnce('<title>Reset your Rolling Budget password</title>', '<title>STAGING - Reset your Rolling Budget password</title>', 'Reset page title');
replaceResetOnce('<body>', '<body>\\n  <aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">STAGING ONLY — isolated from production — ' + config.projectRef + '</aside>', 'Reset staging banner');
assert.ok(!resetHtml.includes('YOUR_SUPABASE_'), 'Reset page has an unconfigured Supabase placeholder');
assert.ok(!resetHtml.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Reset page has an unconfigured storage placeholder');
assert.ok(resetHtml.includes('auth.updateUser({ password })'), 'Reset page does not update the authenticated password');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/rollover-budget-app.html', html);
writeFileSync('dist/auth-confirmation.html', confirmationHtml);
writeFileSync('dist/reset-password.html', resetHtml);
writeFileSync('dist/index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=rollover-budget-app.html"><title>Staging budget</title></head><body><a href="rollover-budget-app.html">Open staging budget</a></body></html>\n');
writeFileSync('dist/.nojekyll', '');
console.log('Built the redesigned staging UI from rollover-budget-app.html for', config.projectRef);
