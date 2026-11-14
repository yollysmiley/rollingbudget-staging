import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261114192802_harden_public_default_privileges.sql', import.meta.url),
  'utf8'
);

test('future public tables, sequences, and functions are not granted to client roles by default', () => {
  for (const objectType of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
    assert.match(
      migration,
      new RegExp('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\\s+REVOKE ALL ON ' + objectType + '\\s+FROM anon, authenticated, service_role;', 'i')
    );
  }
});

test('new public functions do not inherit PostgreSQL PUBLIC execute access', () => {
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres\\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;/i);
});

test('migration does not modify existing budget rows, tables, or ownership policies', () => {
  assert.doesNotMatch(migration, /\\b(?:DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE|CREATE POLICY)\\b/i);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
});
