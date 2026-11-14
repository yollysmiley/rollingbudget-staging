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
replaceOnce('<title>Multi-Year Rolling Budget &amp; Planning Manager</title>', '<title>STAGING - Multi-Year Rolling Budget &amp; Planning Manager</title>', 'Page title');
replaceOnce('<body>', '<body>\n  <aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">STAGING ONLY — isolated from production — ' + config.projectRef + '</aside>', 'Staging banner');

assert.ok(html.includes('function storageKey(year)'), 'Account-scoped storage is missing');
assert.ok(html.includes('from("user_budgets").select("year,budget_data")'), 'Cloud data loading is missing');
assert.ok(html.includes('from("user_budgets").upsert('), 'Cloud data saving is missing');
assert.ok(!html.includes('YOUR_SUPABASE_'), 'Unconfigured Supabase placeholder remains');
assert.ok(!html.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Unconfigured storage placeholder remains');
assert.ok(!html.includes('awalptqpsjflrahkrjzk'), 'Production project reference remains');
assert.ok(!html.includes('sb_secret_'), 'Secret key marker found');
assert.ok(!html.includes('localStorage.removeItem('), 'Build must not delete browser data');
assert.ok(html.includes('function esc(str)') && html.includes('&lt;'), 'HTML text escaping is missing');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/rollover-budget-app.html', html);
writeFileSync('dist/index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=rollover-budget-app.html"><title>Staging budget</title></head><body><a href="rollover-budget-app.html">Open staging budget</a></body></html>\n');
writeFileSync('dist/.nojekyll', '');
console.log('Built the redesigned staging UI from rollover-budget-app.html for', config.projectRef);
