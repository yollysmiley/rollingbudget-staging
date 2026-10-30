import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hardenRendering } from './harden-rendering.mjs';
import { integrateRelease2 } from './integrate-release2.mjs';

const config = JSON.parse(readFileSync(new URL('../staging-config.json', import.meta.url), 'utf8'));
assert.equal(config.environment, 'staging');
assert.equal(config.projectRef, 'phiscfwfuzeptetimdbo');
assert.equal(config.supabaseUrl, 'https://phiscfwfuzeptetimdbo.supabase.co');
assert.match(config.publishableKey, /^sb_publishable_[A-Za-z0-9_-]+$/);
assert.equal(config.storagePrefix, 'rollingbudget_staging_phiscfwfuzeptetimdbo');
assert.ok(process.argv[2], 'Pass the path to the pinned source rollover-budget-app.html');
let html = readFileSync(resolve(process.argv[2]), 'utf8');

function replaceOnce(pattern, replacement, label) {
  const matches = [...html.matchAll(new RegExp(pattern.source, 'g'))];
  assert.equal(matches.length, 1, `${label}: source changed; review build transform`);
  html = html.replace(pattern, () => replacement);
}

replaceOnce(/const SUPABASE_URL = '[^']*';/, `const SUPABASE_URL = ${JSON.stringify(config.supabaseUrl)};`, 'Supabase URL');
replaceOnce(/const SUPABASE_ANON_KEY = '[^']*';/, `const SUPABASE_ANON_KEY = ${JSON.stringify(config.publishableKey)};`, 'Client key');
replaceOnce(/supabase\.createClient\(SUPABASE_URL, SUPABASE_ANON_KEY\)/, `supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: ${JSON.stringify(config.storagePrefix + '_auth')} } })`, 'Auth storage');

for (const key of ['rollover_pro_v5', 'rollover_pro_v4', 'budget_theme']) {
  assert.ok(html.includes(key), `Missing expected storage key: ${key}`);
  html = html.replaceAll(key, config.storagePrefix + '_' + key);
}

replaceOnce(/<title>Rollover Budget Pro<\/title>/, '<title>STAGING - Rollover Budget Pro</title>', 'Page title');
replaceOnce(/<body>/, '<body>\n<aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">STAGING — SYNTHETIC TEST DATA ONLY — phiscfwfuzeptetimdbo</aside>', 'Staging banner');

assert.ok(!html.includes('awalptqpsjflrahkrjzk'), 'Production project reference remains');
assert.ok(!html.includes('sb_secret_'), 'Secret key marker found');
for (const key of ['rollover_pro_v5', 'rollover_pro_v4', 'budget_theme']) {
  assert.ok(!html.includes(`'${key}'`) && !html.includes(`"${key}"`), `Unisolated storage key remains: ${key}`);
}

html = hardenRendering(html);
html = integrateRelease2(html, config.storagePrefix);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/rollover-budget-app.html', html);
writeFileSync('dist/index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=rollover-budget-app.html"><title>Staging budget</title></head><body><a href="rollover-budget-app.html">Open staging budget</a></body></html>\n');
writeFileSync('dist/.nojekyll', '');
console.log('Built staging frontend for', config.projectRef, 'in dist; production source was not modified.');
