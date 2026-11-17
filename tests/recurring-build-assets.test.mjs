import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Build runs before unit and browser tests in staging CI. Check both URL roots,
// since the authenticated app resolves imports relative to /app/.
test('staging build ships recurring service and every browser import dependency', () => {
  for (const route of ['dist/scripts', 'dist/app/scripts']) {
    for (const name of [
      'due-day.mjs', 'recurring-foundation.mjs',
      'recurring-scheduler.mjs',
      'recurring-budget-preview.mjs',
      'recurring-app-service.mjs'
    ]) {
      assert.ok(existsSync(route + '/' + name), route + '/' + name + ' must be published');
    }
    const service = readFileSync(route + '/recurring-app-service.mjs', 'utf8');
    const preview = readFileSync(route + '/recurring-budget-preview.mjs', 'utf8');
    const scheduler = readFileSync(route + '/recurring-scheduler.mjs', 'utf8');
    assert.match(service, /\.\/recurring-budget-preview\.mjs/);
    assert.match(service, /\.\/recurring-foundation\.mjs/);
    assert.match(preview, /\.\/recurring-scheduler\.mjs/);
    assert.match(scheduler, /\.\/recurring-foundation\.mjs/);
  }
  const app = readFileSync('dist/app/index.html', 'utf8');
  assert.match(app, /import\('\.\/scripts\/due-day\.mjs'\)/);
  for (const id of ['newFixDue', 'newVarDue', 'newLoanDue', 'newCcDue']) {
    assert.match(app, new RegExp('<select id="' + id + '"'));
    assert.doesNotMatch(app, new RegExp('<input[^>]*id="' + id + '"'));
  }
  assert.match(app, /import\('\.\/scripts\/recurring-app-service\.mjs'\)/);
});

test('desktop and mobile recurring manager use date fields without manual preview/apply controls', () => {
  const app = readFileSync('rollover-budget-app.html', 'utf8');
  for (const view of ['desktop', 'mobile']) {
    const section = app.match(new RegExp('data-recurring-form="' + view + '"[\\s\\S]*?data-rec-field="frequency"'));
    assert.ok(section, view + ' recurring form must exist');
    assert.match(section[0], /data-rec-field="startDate" type="date" required/);
    assert.match(section[0], /data-rec-field="endDate" type="date"/);
  }
  assert.doesNotMatch(app, /id="(?:desktop|mobile)ApplyRecurringPreview"/);
  assert.doesNotMatch(app, /id="(?:desktop|mobile)RecurringPreviewStatus"/);
  assert.doesNotMatch(app, /potential recurring entries|Apply scheduled entries/i);
  assert.doesNotMatch(app, /data-rec-field="startMonth"|data-rec-field="due"/);
});

test('staging publishes category and migration modules at both import roots', () => {
  for (const route of ['dist/scripts', 'dist/app/scripts']) {
    for (const name of ['expense-category-model.mjs', 'expense-category-storage.mjs',
      'expense-entry-migration.mjs', 'account-budget.mjs']) {
      assert.ok(existsSync(route + '/' + name), route + '/' + name + ' must be published');
    }
  }
  const app = readFileSync('dist/app/index.html', 'utf8');
  assert.match(app, /import\('\.\/scripts\/expense-entry-migration\.mjs'\)/);
  assert.match(app, /import\('\.\/scripts\/expense-category-storage\.mjs'\)/);
});
