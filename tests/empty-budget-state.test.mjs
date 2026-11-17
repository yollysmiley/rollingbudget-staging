import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/rollover-budget-app.html', import.meta.url), 'utf8');
const revisions = readFileSync(new URL('../dist/scripts/budget-revision.mjs', import.meta.url), 'utf8');

test('staging build uses the redesigned UI and isolated staging project', () => {
  assert.ok(html.includes('STAGING ONLY'));
  assert.ok(html.includes('phiscfwfuzeptetimdbo'));
  assert.ok(html.includes('const STAGING_STORAGE_PREFIX = "rollingbudget_staging_phiscfwfuzeptetimdbo"'));
  assert.ok(html.includes('const SUPABASE_URL = "https://phiscfwfuzeptetimdbo.supabase.co"'));
  assert.ok(html.includes('const BASELINE_2026 = {'));
  assert.doesNotMatch(html, /4015[.]79|3498[.]73|1050[.]86|Yolande Pay|Planet Home Lending/);
});

test('new UI preserves browser data and uses account-scoped local storage', () => {
  assert.ok(html.includes('function storageKey(year)'));
  assert.ok(html.includes('currentUser?.id || "guest"'));
  assert.ok(!html.includes('localStorage.removeItem(storageKey('));
  assert.ok(html.includes("localStorage.removeItem(conflictStorageKey(year, owner))"));
  assert.ok(html.includes("localStorage.setItem(conflictStorageKey(year, owner), '1')"));
  assert.ok(html.includes("key !== owner + ':' + year"));
  assert.ok(html.includes('localStorage.getItem(storageKey(yr))'));
  assert.ok(html.includes('availableBudgetYears(new Date().getFullYear()'));
  assert.ok(!html.includes('for (const yr of ["2026", "2027"])'));
  assert.ok(html.includes('localStorage.setItem(storageKey(year)'));
  assert.ok(html.includes('const year = activeYear;'));
  assert.ok(html.includes('const userId = currentUser?.id || null;'));
});

test('new UI loads and saves its own cloud records without touching Release 2 data', () => {
  assert.ok(html.includes('from("budget_ui_years").select("year,budget_data,updated_at")'));
  assert.ok(html.includes("import('./scripts/budget-revision.mjs')"));
  assert.ok(html.includes('writeBudgetRevision('));
  assert.match(revisions, /\.insert\(\{/);
  assert.match(revisions, /\.eq\('updated_at', knownRevision\)\.select\('year'\)/);
  assert.ok(!html.includes('from("budget_ui_years").upsert('));
  assert.ok(!html.includes('from("budget_data")'));
});

test('user-entered strings are HTML-escaped before entering markup', () => {
  assert.ok(html.includes('function esc(str)'));
  assert.ok(html.includes('.replace(/</g, "&lt;")'));
  assert.ok(html.includes('esc(rule.name)'));
  assert.ok(html.includes("esc(rule.endDate ? 'Ends ' + rule.endDate : 'No end date')"));
  assert.ok(html.includes('esc(startOf(rule))'));
  assert.doesNotMatch(html, /data-rec-field="due"|data-rec-field="startMonth"/);
});

test('staging migration creates a separate RLS-protected table for the new UI', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261114184318_create_budget_ui_years.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes('CREATE TABLE public.budget_ui_years'));
  assert.ok(migration.includes('PRIMARY KEY (user_id, year)'));
  assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'));
  assert.ok(migration.includes('auth.uid()'));
  assert.ok(migration.includes('public.budget_data'));
});

test('local and cloud budgets are compared semantically and divergent local records are protected', () => {
  assert.ok(html.includes('function parseLocalBudgetRecord(raw)'));
  assert.ok(html.includes("await import('./scripts/year-discovery.mjs')"));
  assert.ok(html.includes('sameBudgetDocument(local.data, row.budget_data)'));
  assert.ok(html.includes('markCloudConflict(key, year)'));
  assert.doesNotMatch(html, /function chooseNewestBudget\(/);
  assert.ok(revisions.includes('updated_at: updatedAt'));
  assert.ok(html.includes('select("year,budget_data,updated_at")'));
  assert.ok(html.includes('Never replace an unreadable local snapshot'));
});
