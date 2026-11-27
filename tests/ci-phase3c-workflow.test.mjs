import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ci = readFileSync(new URL('../.github/workflows/build-staging.yml', import.meta.url), 'utf8');

test('change-aware build uses base-SHA trusted code and complete PR enumeration, failing closed', () => {
  assert.match(ci, /pull-requests: read/);
  assert.match(ci, /id: trusted-base[\s\S]*?ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(ci, /persist-credentials: false/);
  assert.match(ci, /rm -rf -- \.ci-trusted/);
  assert.match(ci, /git -C \.ci-trusted rev-parse HEAD/);
  assert.match(ci, /"\$TRUSTED_SHA" == "\$BASE_SHA"/);
  assert.match(ci, /steps\.trusted-base\.outcome.*success/);
  assert.match(ci, /EXPECTED_CHANGED_FILES: \$\{\{ github\.event\.pull_request\.changed_files \}\}/);
  assert.match(ci, /node \.ci-trusted\/scripts\/resolve-ci-mode\.mjs/);
  assert.match(ci, /MODE=full/);
  assert.match(ci, /if \[\[ "\$MODE" != "lightweight" \]\]; then MODE=full; fi/);
});

test('documentation-only build exemption is explicit and substantial gates remain active for full validation', () => {
  for (const item of [
    'Install pinned test runner',
    'Validate authenticated test JavaScript syntax',
    'Discover authenticated cases without credentials or live requests',
    'Install Chromium',
    'Build redesigned UI with staging-only configuration',
    'Run unit, security, and rendering regression tests',
    'Synthetic backup and restore regression',
    'Run desktop and mobile acceptance tests',
    'Upload static staging build',
  ]) {
    const section = ci.slice(ci.indexOf(`      - name: ${item}`));
    assert.ok(section.startsWith(`      - name: ${item}\n        if: steps.ci-mode.outputs.mode != 'lightweight'\n`), item);
  }
  assert.match(ci, /Record approved documentation-only exemption/);
  assert.match(ci, /if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.doesNotMatch(ci, /secrets\.STAGING_DB_URL/);
});
