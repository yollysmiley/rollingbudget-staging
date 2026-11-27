import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ci = readFileSync(new URL('../.github/workflows/build-staging.yml', import.meta.url), 'utf8');

test('change-aware build uses base-SHA trusted code and immutable PR diffs, failing closed', () => {
  assert.doesNotMatch(ci, /GH_API_TOKEN/);
  assert.match(ci, /id: trusted-base[\s\S]*?ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(ci, /persist-credentials: false/);
  assert.match(ci, /rm -rf -- \.ci-trusted/);
  assert.match(ci, /git -C \.ci-trusted rev-parse HEAD/);
  assert.match(ci, /"\$TRUSTED_SHA" == "\$BASE_SHA"/);
  assert.match(ci, /steps\.trusted-base\.outcome.*success/);
  assert.ok(ci.includes('HEAD_SHA:'));
  assert.ok(ci.includes('MERGE_SHA:'));
  assert.match(ci, /node \.ci-trusted\/scripts\/resolve-ci-mode\.mjs/);
  assert.match(ci, /MODE=full/);
  assert.ok(ci.includes('case "$MODE" in lightweight|presentation|backup|full) ;; *) MODE=full ;; esac'));
});

test('documentation-only build exemption is explicit and substantial gates remain active for full validation', () => {
  for (const item of [
    'Install pinned test runner',
    'Validate authenticated test JavaScript syntax',
    'Discover authenticated cases without credentials or live requests',
    'Install Chromium',
    'Build redesigned UI with staging-only configuration',
    'Run unit, security, and rendering regression tests',
    'Run desktop and mobile acceptance tests',
    'Upload static staging build',
  ]) {
    const section = ci.slice(ci.indexOf(`      - name: ${item}`));
    assert.ok(section.startsWith(`      - name: ${item}\n        if: needs.classify.outputs.mode != 'lightweight'\n`), item);
  }
  assert.match(ci, /Record approved documentation-only exemption/);
  assert.match(ci, /if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.doesNotMatch(ci, /secrets\.STAGING_DB_URL/);
});

test('only full and backup modes execute synthetic backup restore',()=>{
  for(const step of ['- uses: supabase/setup-cli@v1','- name: Synthetic backup and restore regression']) assert.ok(ci.includes(step+"\n        if: needs.classify.outputs.mode == 'full' || needs.classify.outputs.mode == 'backup'"));
});
