import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/rollover-budget-app.html', import.meta.url), 'utf8');

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
  assert.ok(!html.includes('localStorage.removeItem('));
  assert.ok(html.includes('localStorage.getItem(storageKey(yr))'));
  assert.ok(html.includes('localStorage.setItem(storageKey(activeYear)'));
});

test('new UI loads and saves its own cloud records without touching Release 2 data', () => {
  assert.ok(html.includes('from("budget_ui_years").select("year,budget_data,updated_at")'));
  assert.ok(html.includes('from("budget_ui_years").upsert('));
  assert.ok(!html.includes('from("budget_data")'));
});

test('user-entered strings are HTML-escaped before entering markup', () => {
  assert.ok(html.includes('function esc(str)'));
  assert.ok(html.includes('.replace(/</g, "&lt;")'));
  assert.ok(html.includes('esc(r.name)'));
  assert.ok(html.includes('esc(r.due'));
});

test('staging migration creates a separate RLS-protected table for the new UI', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261113010000_create_budget_ui_years.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes('CREATE TABLE public.budget_ui_years'));
  assert.ok(migration.includes('PRIMARY KEY (user_id, year)'));
  assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'));
  assert.ok(migration.includes('auth.uid()'));
  assert.ok(migration.includes('public.budget_data'));
});

test('local and cloud budget records are compared by their update timestamps', () => {
  assert.ok(html.includes('function parseLocalBudgetRecord(raw)'));
  assert.ok(html.includes('function chooseNewestBudget(localRecord, cloudRecord)'));
  assert.ok(html.includes('updated_at: updatedAt'));
  assert.ok(html.includes('select("year,budget_data,updated_at")'));
  assert.ok(html.includes('Unversioned local data preserved'));
});
