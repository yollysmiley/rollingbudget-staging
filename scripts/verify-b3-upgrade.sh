#!/usr/bin/env bash
set -euo pipefail

# B3 upgrade regression: disposable PostgreSQL only, no live Supabase access.
: "${PGHOST:?Set isolated PGHOST}"
: "${PGDATABASE:?Set isolated PGDATABASE}"
if [[ "${PGHOST}" != "127.0.0.1" && "${PGHOST}" != "localhost" ]] ||
   [[ "${PGDATABASE}" != "migration_replay" ]]; then
  echo "B3 upgrade test refuses non-disposable PostgreSQL targets" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
SQL

mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort)
if [[ "${#migrations[@]}" -ne 16 ||
      "${migrations[6]}" != *"protect_global_recurring_account_refs.sql" ]]; then
  echo "Expected sixteen staging migrations including pending alignment migrations" >&2
  exit 1
fi
for migration in "${migrations[@]:0:6}"; do
  psql -X -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
done

psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000401');
INSERT INTO public.budget_accounts(user_id,id,name)
VALUES ('00000000-0000-4000-8000-000000000401','checking','Test checking');
INSERT INTO public.budget_ui_years(user_id,year,budget_data)
VALUES ('00000000-0000-4000-8000-000000000401',2028,'{"test":"preserved"}'::jsonb);
-- An old rule references a missing account. Never rewrite the rule automatically.
INSERT INTO public.budget_recurring_rules
  (user_id,id,name,category,amount,frequency,start_date,versions,account_id)
VALUES ('00000000-0000-4000-8000-000000000401','orphan-test','Preserved test rule',
        'fixed',25,'monthly','2028-01-15','[]'::jsonb,'missing');
SQL

# Must fail specifically on the preflight, not quietly install an invalid FK.
if psql -X -v ON_ERROR_STOP=1 -f "${migrations[6]}" > /tmp/b3-orphan-upgrade.log 2>&1; then
  echo "B3 migration wrongly accepted an orphan account reference" >&2
  exit 1
fi
if ! grep -q 'orphaned or cross-owner rule account reference' /tmp/b3-orphan-upgrade.log; then
  cat /tmp/b3-orphan-upgrade.log >&2
  echo "B3 migration failed for an unexpected reason" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_recurring_account_owner_fk'
       AND conrelid='public.budget_recurring_rules'::regclass) THEN
    RAISE EXCEPTION 'Failed B3 migration committed a constraint';
  END IF;
  IF (SELECT count(*) FROM public.budget_recurring_rules
      WHERE id='orphan-test' AND account_id='missing') <> 1 THEN
    RAISE EXCEPTION 'Failed B3 migration modified the existing rule';
  END IF;
  IF (SELECT budget_data->>'test' FROM public.budget_ui_years
      WHERE user_id='00000000-0000-4000-8000-000000000401' AND year=2028) <> 'preserved' THEN
    RAISE EXCEPTION 'Failed B3 migration modified the budget year';
  END IF;
END $$;
-- Explicit safe remediation: restore the legitimately referenced test account.
INSERT INTO public.budget_accounts(user_id,id,name)
VALUES ('00000000-0000-4000-8000-000000000401','missing','Restored test account');
SQL

psql -X -v ON_ERROR_STOP=1 -f "${migrations[6]}" >/dev/null
psql -X -v ON_ERROR_STOP=1 -f "${migrations[7]}" >/dev/null
psql -X -v ON_ERROR_STOP=1 -f "${migrations[8]}" >/dev/null
psql -X -v ON_ERROR_STOP=1 -f "${migrations[9]}" >/dev/null
# Re-applying a forward-only migration must not overwrite existing records.
psql -X -v ON_ERROR_STOP=1 -f "${migrations[6]}" >/dev/null
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_recurring_account_owner_fk'
    AND conrelid='public.budget_recurring_rules'::regclass AND convalidated) THEN
    RAISE EXCEPTION 'B3 upgrade did not validate the recurring account FK';
  END IF;
  IF (SELECT count(*) FROM public.budget_recurring_rules WHERE id='orphan-test'
      AND account_id='missing') <> 1 THEN
    RAISE EXCEPTION 'B3 upgrade changed existing recurring rules';
  END IF;
  IF (SELECT budget_data->>'test' FROM public.budget_ui_years
      WHERE user_id='00000000-0000-4000-8000-000000000401' AND year=2028) <> 'preserved' THEN
    RAISE EXCEPTION 'B3 upgrade altered prior year budget data';
  END IF;
END $$;
SQL
echo "B3 orphan rejection, rollback, safe remediation, and populated upgrade passed"
