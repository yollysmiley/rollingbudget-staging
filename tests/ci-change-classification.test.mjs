import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCiChanges, LIGHTWEIGHT_DOC_PATHS } from '../scripts/classify-ci-changes.mjs';

const pr = (files, overrides = {}) => classifyCiChanges({ eventName: 'pull_request', files, complete: true, ...overrides });
const modified = (filename) => ({ filename, status: 'modified' });
const mode = (result) => result.mode;

test('explicitly allowlisted documentation modifications qualify for lightweight validation', () => {
  assert.ok(LIGHTWEIGHT_DOC_PATHS.has('README.md'));
  assert.equal(mode(pr([modified('README.md'), modified('docs/CI_RESPONSIBILITIES.md')])), 'lightweight');
});

test('all application, database, security, test, and workflow changes require full validation', () => {
  for (const path of [
    'rollover-budget-app.html', 'styles.css', 'scripts/live-staging-tests.mjs',
    'supabase/migrations/20260101.sql', 'tests/ci-workflows.test.mjs',
    '.github/workflows/build-staging.yml', 'package-lock.json',
    'docs/unknown.md', 'docs/NEW_GUIDE.md',
  ]) {
    assert.equal(mode(pr([modified(path)])), 'full', path);
  }
});

test('mixed change requires full validation even with allowlisted documentation', () => {
  assert.equal(mode(pr([modified('README.md'), modified('tests/ci-workflows.test.mjs')])), 'full');
});

test('additions, deletions, renames and copies do not qualify for lightweight mode', () => {
  for (const entry of [
    { filename: 'README.md', status: 'added' },
    { filename: 'README.md', status: 'removed' },
    { filename: 'README.md', status: 'renamed', previous_filename: 'old.md' },
    { filename: 'README.md', status: 'copied', previous_filename: 'old.md' },
    { filename: 'README.md', status: 'modified', previous_filename: 'old.md' },
  ]) {
    assert.equal(mode(pr([entry])), 'full', JSON.stringify(entry));
  }
});

test('missing, empty, incomplete or malformed changes default to full validation', () => {
  for (const value of [undefined, [], null, {}, [null], [modified('../README.md')],
    [{ filename: 'README.md' }], [{ filename: 'README.md', status: 'mystery' }]]) {
    assert.equal(mode(pr(value)), 'full');
  }
  assert.equal(mode(pr([modified('README.md')], { complete: false })), 'full');
  assert.equal(mode(classifyCiChanges()), 'full');
});

test('main pushes, other pushes, and manual dispatch always require full validation', () => {
  for (const eventName of ['push', 'workflow_dispatch', 'schedule', undefined]) {
    assert.equal(mode(pr([modified('README.md')], { eventName })), 'full');
  }
});

test('malformed paths and ambiguous records fail closed', () => {
  for (const path of ['/README.md', './README.md', 'docs/../README.md', 'README.md\\n', 'README md']) {
    assert.equal(mode(pr([modified(path)])), 'full');
  }
  assert.equal(mode(pr([{ filename: 'README.md', status: 'modified', previous_filename: null }])), 'lightweight');
});
