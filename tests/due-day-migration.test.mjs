import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261116172229_add_recurring_due_day_and_full_dates.sql', 'utf8');

test('staging due-day migration is additive, validated, and backward-compatible', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS due_day smallint/i);
  assert.match(sql, /due_day BETWEEN 1 AND 31/i);
  assert.match(sql, /EXTRACT\(DAY FROM start_date\)/i);
  assert.match(sql, /jsonb_build_object\('dueDay'/i);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS recurring_start_month/i);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS recurring_end_month/i);
  assert.doesNotMatch(sql, /DROP (?:COLUMN|TABLE).*due\b/i);
  assert.doesNotMatch(sql, /TRUNCATE|DELETE FROM|auth\.users|budget_ui_years/i);
  assert.match(sql, /\bBEGIN;/);
  assert.match(sql, /\bCOMMIT;/);
});
