import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../rollover-budget-app.html', import.meta.url), 'utf8');
const authenticated = readFileSync(new URL('./authenticated.spec.js', import.meta.url), 'utf8');
const apiTests = readFileSync(new URL('../../scripts/live-staging-tests.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/live-staging-tests.yml', import.meta.url), 'utf8');

test('authenticated tests target the active staging table and dashboard contract', () => {
  assert.match(app, /from\("budget_ui_years"\)\.select\("year,budget_data,updated_at"\)/);
  assert.match(app, /from\("budget_ui_years"\)\.upsert\(/);
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
