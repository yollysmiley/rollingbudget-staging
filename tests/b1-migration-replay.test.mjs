import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const replay = readFileSync('scripts/verify-clean-migration-replay.sh', 'utf8');
const workflow = readFileSync('.github/workflows/staging-postgres-contracts.yml', 'utf8');
const migrationFiles = readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort();

test('B1 replay uses only an isolated localhost database and fails on SQL errors', () => {
  assert.match(replay, /PGHOST.*127\.0\.0\.1/);
  assert.match(replay, /PGDATABASE.*migration_replay/);
  assert.match(replay, /ON_ERROR_STOP=1/);
  assert.match(replay, /set -euo pipefail/);
  assert.doesNotMatch(replay, /phiscfwfuzeptetimdbo|awalptqpsjflrahkrjzk/);
});

test('B1 replay enumerates all committed SQL migrations in order', () => {
  assert.equal(migrationFiles.length, 10);
  assert.match(replay, /find supabase\/migrations/);
  assert.match(replay, /LC_ALL=C sort/);
  assert.match(replay, /migrations\[@\]/);
  assert.match(replay, /policy_count <> 16/);
  assert.match(replay, /index_count <> 9/);
});

test('Consolidated B1 workflow is secret-free and preserves migration replay', () => {
  assert.match(workflow, /image: postgres:17/);
  assert.match(workflow, /POSTGRES_DB: migration_replay/);
  assert.match(workflow, /bash scripts\/verify-clean-migration-replay\.sh/);
  assert.doesNotMatch(workflow, /secrets\.|supabase\.co|apply_migration|deploy-pages/);
});

test('B3 migration rejects orphaned references and enforces a validated tenant-safe RESTRICT FK', () => {
  const migration = readFileSync('supabase/migrations/20261117024033_protect_global_recurring_account_refs.sql', 'utf8');
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /account_id IS NOT NULL AND a\.id IS NULL/);
  assert.match(migration, /FOREIGN KEY \(user_id, account_id\)/);
  assert.match(migration, /REFERENCES public\.budget_accounts \(user_id, id\)/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /VALIDATE CONSTRAINT budget_recurring_account_owner_fk/);
  assert.doesNotMatch(migration, /ON DELETE CASCADE|SET NULL/);
});

test('committed migrations match the applied staging manifest', () => {
  const expected = [
    '20261029194718_create_staging_budget_data.sql',
    '20261114184318_create_budget_ui_years.sql',
    '20261114192802_harden_public_default_privileges.sql',
    '20261114221703_create_budget_accounts.sql',
    '20261115043822_create_budget_recurring_rules.sql',
    '20261116172229_add_recurring_due_day_and_full_dates.sql',
    '20261117024033_protect_global_recurring_account_refs.sql',
    '20261117071635_create_budget_expense_categories.sql',
    '20261117071637_remove_expense_category_kind.sql',
    '20261117071639_allow_custom_recurring_categories.sql'
  ];
  assert.deepEqual(migrationFiles, expected);
});
