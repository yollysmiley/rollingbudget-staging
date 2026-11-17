#!/usr/bin/env bash
set -euo pipefail

# B1: Replay committed staging SQL against an empty disposable PostgreSQL instance.
# Never point this script at staging or production: it creates a minimal Supabase auth shim.
: "${PGHOST:?Set PGHOST to an isolated PostgreSQL host}"
: "${PGPORT:?Set PGPORT}"
: "${PGUSER:?Set PGUSER}"
: "${PGDATABASE:?Set PGDATABASE}"
if [[ "${PGHOST}" != "127.0.0.1" && "${PGHOST}" != "localhost" ]]; then
  echo "Refusing migration replay against a non-local database host" >&2
  exit 1
fi
if [[ "${PGDATABASE}" != "migration_replay" ]]; then
  echo "Refusing replay outside dedicated migration_replay database" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
SQL

mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort)
if [[ "${#migrations[@]}" -ne 10 ]]; then
  echo "Expected ten staging migrations including expense categories; found ${#migrations[@]}. Review the replay manifest." >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  echo "Replaying ${migration}"
  psql -X -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
done

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $
DECLARE
  constraint_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO constraint_definition
  FROM pg_constraint
  WHERE conrelid = 'public.budget_recurring_rules'::regclass
    AND conname = 'budget_recurring_rules_category_check';
  IF constraint_definition IS NULL OR
     position('category' in constraint_definition) = 0 OR
     position('income' in constraint_definition) = 0 THEN
    RAISE EXCEPTION 'Custom recurring category constraint missing after replay';
  END IF;
END $;
SQL

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $
DECLARE
  table_count integer;
  policy_count integer;
  index_count integer;
BEGIN
  SELECT count(*) INTO table_count FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN ('budget_data','budget_ui_years','budget_accounts','budget_recurring_rules','budget_expense_categories')
    AND c.relrowsecurity;
  IF table_count <> 5 THEN
    RAISE EXCEPTION 'Expected five RLS-enabled budget tables, found %', table_count;
  END IF;

  SELECT count(*) INTO policy_count FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('budget_data','budget_ui_years','budget_accounts','budget_recurring_rules')
    AND roles = ARRAY['authenticated']::name[];
  IF policy_count <> 16 THEN
    RAISE EXCEPTION 'Expected 16 authenticated owner policies, found %', policy_count;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'budget_%'
      AND (coalesce(qual,'') || coalesce(with_check,'')) NOT LIKE '%auth.uid()%') THEN
    RAISE EXCEPTION 'Budget policy without auth.uid ownership predicate';
  END IF;

  SELECT count(*) INTO index_count FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('budget_data','budget_ui_years','budget_accounts','budget_recurring_rules','budget_expense_categories');
  IF index_count <> 9 THEN
    RAISE EXCEPTION 'Expected nine budget indexes, found %', index_count;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.budget_recurring_rules'::regclass
      AND conname IN ('recurring_start_month','recurring_end_month')) THEN
    RAISE EXCEPTION 'Obsolete first-of-month constraint remains';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.budget_recurring_rules'::regclass
      AND conname = 'budget_recurring_due_day_range') THEN
    RAISE EXCEPTION 'Missing recurring due-day range constraint';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.budget_recurring_rules'::regclass
      AND conname = 'recurring_dates_valid') THEN
    RAISE EXCEPTION 'Missing recurring date ordering constraint';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.budget_recurring_rules'::regclass
      AND conname = 'budget_recurring_account_owner_fk'
      AND contype = 'f'
      AND convalidated
      AND confdeltype = 'r'
      AND confrelid = 'public.budget_accounts'::regclass) THEN
    RAISE EXCEPTION 'Missing validated tenant-safe recurring-account FK';
  END IF;
END $$;
SQL
echo "B1 clean migration replay and schema contract checks passed"
