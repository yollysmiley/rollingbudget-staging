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
  assert.ok(html.includes('from("budget_ui_years").select("year,budget_data")'));
  assert.ok(html.includes('from("budget_ui_years").upsert('));
  assert.ok(!html.includes('from("budget_data")'));
});

test('user-entered strings are HTML-escaped before entering markup', () => {
  assert.ok(html.includes('function esc(str)'));
  assert.ok(html.includes('.replace(/</g, "&lt;")'));
  assert.ok(html.includes('esc(r.name)'));
  assert.ok(html.includes('esc(r.due'));
});
