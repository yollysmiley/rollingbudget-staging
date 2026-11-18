import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../rollover-budget-app.html', import.meta.url), 'utf8');
const revisions = readFileSync(new URL('../../scripts/budget-revision.mjs', import.meta.url), 'utf8');
const authenticated = readFileSync(new URL('./authenticated.spec.js', import.meta.url), 'utf8');
const apiTests = readFileSync(new URL('../../scripts/live-staging-tests.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/live-staging-tests.yml', import.meta.url), 'utf8');

test('authenticated tests target the active staging table and dashboard contract', () => {
  assert.match(app, /from\("budget_ui_years"\)\.select\("year,budget_data,updated_at"\)/);
  assert.match(app, /import\('\.\/scripts\/budget-revision\.mjs'\)/);
  assert.match(app, /writeBudgetRevision\(/);
  assert.match(revisions, /\.insert\(\{/);
  assert.match(revisions, /\.eq\('user_id', owner\)\.eq\('year', Number\(year\)\)/);
  assert.match(revisions, /\.eq\('updated_at', knownRevision\)\.select\('year'\)/);
  assert.doesNotMatch(revisions, /\.upsert\(/);
  assert.doesNotMatch(app, /from\("budget_ui_years"\)\.upsert\(/);
  assert.match(authenticated, /#incomeBody/);
  assert.match(authenticated, /currentUser\?\.id/);
  assert.match(authenticated, /budget_ui_years/);
  assert.doesNotMatch(authenticated, /rb2Account|#paycheckContainer|#excludedBucketContainer|\/rest\/v1\/budget_data/);
});

test('live API ownership tests use the same year-based table as the app', () => {
  assert.match(apiTests, /budget_ui_years/);
  assert.match(apiTests, /const year = 2199/);
  assert.doesNotMatch(apiTests, /\/rest\/v1\/budget_data/);
});

test('live workflow builds from the checked-out staging revision only', () => {
  assert.match(workflow, /node scripts\/build-staging\.mjs/);
  assert.doesNotMatch(workflow, /yollysmiley\/rollingbudget/);
  assert.doesNotMatch(workflow, /upstream\//);
});

// Guard the live acceptance harness against reintroducing guest-first protected-page assumptions.

test('live integration allows protected manual dispatch only for the approved validation branch', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' &&\s*github\.ref == 'refs\/heads\/fix\/phase2b-confirm-logout-dialog'/);
  assert.match(workflow, /environment: staging-live-tests/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /refs\/heads\/audit\/b4-rls-schema-contract/);
});
