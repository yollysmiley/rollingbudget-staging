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
assert.ok(html.includes('from("budget_ui_years").insert('), 'New cloud year insert is missing');
assert.ok(html.includes('from("budget_ui_years")') && html.includes('.eq("updated_at", version).select("year")'),
  'Conditional cloud revision saving is missing');
assert.ok(!html.includes('YOUR_SUPABASE_'), 'Unconfigured Supabase placeholder remains');
assert.ok(!html.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Unconfigured storage placeholder remains');
assert.ok(!html.includes('awalptqpsjflrahkrjzk'), 'Production project reference remains');
assert.ok(!html.includes('sb_secret_'), 'Secret key marker found');
assert.ok(!/localStorage\\.removeItem\\(storageKey\\(/.test(html), 'Build must not delete budget records');
assert.ok(html.includes("localStorage.removeItem(conflictStorageKey(year))"), 'Conflict marker cleanup must remain scoped');
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
replaceResetOnce('<body>', '<body>\n  <aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">STAGING ONLY — isolated from production — ' + config.projectRef + '</aside>', 'Reset staging banner');
assert.ok(!resetHtml.includes('YOUR_SUPABASE_'), 'Reset page has an unconfigured Supabase placeholder');
assert.ok(!resetHtml.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Reset page has an unconfigured storage placeholder');
assert.ok(!resetHtml.includes('awalptqpsjflrahkrjzk'), 'Production project reference remains in reset page');
assert.ok(!resetHtml.includes('sb_secret_'), 'Secret key marker found in reset page');
assert.ok(resetHtml.includes('auth.updateUser({ password })'), 'Reset page does not update the authenticated password');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/rollover-budget-app.html', html);
writeFileSync('dist/auth-confirmation.html', confirmationHtml);
writeFileSync('dist/reset-password.html', resetHtml);
let homeHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
homeHtml = homeHtml.replace('YOUR_SUPABASE_URL', config.supabaseUrl).replace('YOUR_SUPABASE_ANON_KEY', config.publishableKey).replace('YOUR_STAGING_STORAGE_PREFIX', config.storagePrefix);
assert.ok(!homeHtml.includes('YOUR_SUPABASE_') && !homeHtml.includes('YOUR_STAGING_STORAGE_PREFIX'));
writeFileSync('dist/index.html', homeHtml);
mkdirSync('dist/app', { recursive: true });
writeFileSync('dist/app/index.html', html);
const brandCss = readFileSync(new URL('../styles/brand.css', import.meta.url), 'utf8');
mkdirSync('dist/styles', { recursive: true });
mkdirSync('dist/app/styles', { recursive: true });
writeFileSync('dist/styles/brand.css', brandCss);
writeFileSync('dist/styles/settings.css', readFileSync(new URL('../styles/settings.css', import.meta.url), 'utf8'));
writeFileSync('dist/app/styles/settings.css', readFileSync(new URL('../styles/settings.css', import.meta.url), 'utf8'));
writeFileSync('dist/styles/homepage.css', readFileSync(new URL('../styles/homepage.css', import.meta.url), 'utf8'));
writeFileSync('dist/app/styles/brand.css', brandCss);
for (const path of [
  'account-model.mjs', 'account-storage.mjs', 'account-budget.mjs',
  'recurring-foundation.mjs', 'recurring-scheduler.mjs',
  'recurring-budget-preview.mjs', 'recurring-app-service.mjs'
]) {
  const source = readFileSync(new URL('./' + path, import.meta.url));
  mkdirSync('dist/scripts', { recursive: true });
  mkdirSync('dist/app/scripts', { recursive: true });
  writeFileSync('dist/scripts/' + path, source);
  writeFileSync('dist/app/scripts/' + path, source);
}
writeFileSync('dist/.nojekyll', '');
console.log('Built the redesigned staging UI from rollover-budget-app.html for', config.projectRef);
