import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const workflow = (name) => readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8');

test('PostgreSQL CI preserves B3, B1 and B4 assertions in isolated order', () => {
  const ci = workflow('staging-postgres-contracts.yml');
  const ordered = [
    'bash scripts/verify-b3-upgrade.sh',
    'DROP DATABASE migration_replay WITH (FORCE)',
    'CREATE DATABASE migration_replay',
    'bash scripts/verify-clean-migration-replay.sh',
    'supabase/verification/verify-b4-postgres-contract.sql',
    'bash scripts/verify-b3-account-races.sh',
  ];
  let previous = -1;
  for (const step of ordered) {
    const position = ci.indexOf(step);
    assert.ok(position > previous, `Missing or incorrectly ordered CI step: ${step}`);
    previous = position;
  }
  assert.equal(ci.match(/bash scripts\/verify-clean-migration-replay\.sh/g)?.length, 1);
  assert.equal(ci.match(/image: postgres:17/g)?.length, 1);
  assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(ci, /branches: \[main\]/);
});

test('Primary CI preserves desktop and mobile checks and authenticated test discovery', () => {
  const ci = workflow('build-staging.yml');
  assert.match(ci, /node --test tests\/\*\.test\.mjs tests\/live\/\*\.test\.mjs/);
  assert.match(ci, /npm run test:e2e/);
  for (const path of [
    'playwright.live.config.js',
    'tests/live/authenticated.spec.js',
    'tests/live/safe-reporter.cjs',
    'tests/live/safety.mjs',
    'scripts/live-staging-tests.mjs',
  ]) {
    assert.ok(ci.includes('node --check ' + path), path);
  }
  assert.match(ci, /npx playwright test --config=playwright\.live\.config\.js --list/);
  assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(ci, /actions\/deploy-pages@v4/);
});

test('Retired duplicate workflows do not run independently', () => {
  for (const name of [
    'b1-migration-replay.yml',
    'b3-populated-upgrade.yml',
    'b4-postgres-contract.yml',
    'authenticated-test-validation.yml',
  ]) {
    assert.equal(existsSync(new URL('../.github/workflows/' + name, import.meta.url)), false, name);
  }
});

test('staging backup regression runs without live credentials in primary CI', () => {
  const ci = workflow('build-staging.yml');
  assert.match(ci, /bash tests\/verify-staging-backup\.sh/);
  assert.match(ci, /bash tests\/verify-staging-cli-restore\.sh/);
  assert.doesNotMatch(ci, /secrets\.STAGING_DB_URL/);
});
