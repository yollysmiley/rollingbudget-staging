import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const replay = readFileSync('scripts/verify-clean-migration-replay.sh', 'utf8');
const workflow = readFileSync('.github/workflows/b1-migration-replay.yml', 'utf8');
const migrationFiles = readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort();

test('B1 replay uses only an isolated localhost database and fails on SQL errors', () => {
  assert.match(replay, /PGHOST.*127\.0\.0\.1/);
  assert.match(replay, /PGDATABASE.*migration_replay/);
  assert.match(replay, /ON_ERROR_STOP=1/);
  assert.match(replay, /set -euo pipefail/);
  assert.doesNotMatch(replay, /phiscfwfuzeptetimdbo|awalptqpsjflrahkrjzk/);
});

test('B1 replay enumerates all committed SQL migrations in order', () => {
  assert.equal(migrationFiles.length, 7);
  assert.match(replay, /find supabase\/migrations/);
  assert.match(replay, /LC_ALL=C sort/);
  assert.match(replay, /migrations\[@\]/);
  assert.match(replay, /policy_count <> 16/);
  assert.match(replay, /index_count <> 7/);
});

test('B1 workflow is secret-free and does not change existing required CI', () => {
  assert.match(workflow, /image: postgres:17/);
  assert.match(workflow, /POSTGRES_DB: migration_replay/);
  assert.match(workflow, /bash scripts\/verify-clean-migration-replay\.sh/);
  assert.doesNotMatch(workflow, /secrets\.|supabase\.co|apply_migration|deploy-pages/);
});
