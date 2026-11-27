import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCiImpact } from '../scripts/classify-ci-impact.mjs';
const modified = filename => ({filename, status: 'modified'});
const pr = (files, overrides = {}) => classifyCiImpact({eventName:'pull_request', complete:true, files, ...overrides});
test('exact presentation allowlist', () => {
  const paths = ['styles/brand.css','styles/settings.css','styles/homepage.css'];
  for (const path of paths) assert.equal(pr([modified(path)]),'presentation');
  assert.equal(pr(paths.map(modified)),'presentation');
});
test('exact backup allowlist', () => assert.equal(pr([modified('scripts/export-staging-backup.sh')]),'backup'));
test('mixed, unknown and sensitive paths remain full', () => {
  for (const path of ['README.md','styles/unknown.css','rollover-budget-app.html','scripts/account-model.mjs','supabase/migrations/example.sql','package-lock.json','.github/workflows/build-staging.yml','tests/browser/mobile.spec.js','auth-confirmation.html','../styles/brand.css']) assert.equal(pr([modified(path)]),'full',path);
  assert.equal(pr([modified('styles/brand.css'),modified('scripts/export-staging-backup.sh')]),'full');
  assert.equal(pr([modified('styles/brand.css'),modified('README.md')]),'full');
});
test('invalid, incomplete, duplicate or non-modified records fail closed', () => {
  for (const files of [null,[],{},[null],[{}],[modified('styles/brand.css'),modified('styles/brand.css')]]) assert.equal(pr(files),'full');
  for (const status of ['added','removed','renamed','copied','changed',undefined]) assert.equal(pr([{filename:'styles/brand.css',status}]),'full');
  assert.equal(pr([{...modified('styles/brand.css'),previous_filename:'old.css'}]),'full');
  assert.equal(pr([modified('styles/brand.css')],{complete:false}),'full');
  assert.equal(classifyCiImpact(null),'full');
});
test('push and manual dispatch remain full', () => {
  for (const eventName of ['push','workflow_dispatch',undefined]) assert.equal(pr([modified('styles/brand.css')],{eventName}),'full');
});
