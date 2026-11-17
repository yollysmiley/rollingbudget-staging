#!/usr/bin/env bash
set -euo pipefail
# B3 concurrency contract: disposable migration_replay PostgreSQL only.
[[ "${PGHOST:-}" == "127.0.0.1" || "${PGHOST:-}" == "localhost" ]] || { echo 'Refusing non-local host' >&2; exit 1; }
[[ "${PGDATABASE:-}" == "migration_replay" ]] || { echo 'Refusing non-replay database' >&2; exit 1; }
workdir=$(mktemp -d)
cleanup() {
  if [[ -n "${worker:-}" ]]; then wait "$worker" 2>/dev/null || true; fi
  psql -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || true
DELETE FROM public.budget_recurring_rules WHERE user_id='00000000-0000-4000-8000-000000000404';
DELETE FROM public.budget_accounts WHERE user_id='00000000-0000-4000-8000-000000000404';
DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000404';
SQL
  rm -rf "$workdir"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000404');
INSERT INTO public.budget_accounts(user_id,id,name)
VALUES ('00000000-0000-4000-8000-000000000404','race-account','Race fixture');
SQL
# Order 1: deletion commits before an in-flight insert can check its FK.
psql -X -v ON_ERROR_STOP=1 >"$workdir/deleter.log" 2>&1 <<SQL &
BEGIN;
DELETE FROM public.budget_accounts
 WHERE user_id='00000000-0000-4000-8000-000000000404' AND id='race-account';
\! touch "$workdir/delete-locked"
SELECT pg_sleep(2);
COMMIT;
SQL
worker=$!
for i in {1..100}; do [[ -e "$workdir/delete-locked" ]] && break; sleep .05; done
[[ -e "$workdir/delete-locked" ]] || { echo 'Delete worker never acquired lock' >&2; exit 1; }
if psql -X -v ON_ERROR_STOP=1 >"$workdir/insert.log" 2>&1 <<'SQL'
INSERT INTO public.budget_recurring_rules
(user_id,id,name,category,amount,frequency,start_date,versions,account_id)
VALUES ('00000000-0000-4000-8000-000000000404','late-rule','Late rule',
'fixed',1,'monthly','2028-01-15','[]'::jsonb,'race-account');
SQL
then echo 'Concurrent insert bypassed deleted-account FK' >&2; exit 1; fi
grep -q 'violates foreign key constraint' "$workdir/insert.log" || { echo 'Insert failed for an unexpected reason' >&2; exit 1; }
wait "$worker"; worker=
psql -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.budget_accounts WHERE user_id='00000000-0000-4000-8000-000000000404')
 OR EXISTS (SELECT 1 FROM public.budget_recurring_rules WHERE user_id='00000000-0000-4000-8000-000000000404')
 THEN RAISE EXCEPTION 'Deletion-first race left partial or orphan data'; END IF;
END $$;
INSERT INTO public.budget_accounts(user_id,id,name)
VALUES ('00000000-0000-4000-8000-000000000404','race-account','Race fixture');
SQL
# Order 2: insert commits before an in-flight deletion can finish.
psql -X -v ON_ERROR_STOP=1 >"$workdir/creator.log" 2>&1 <<SQL &
BEGIN;
INSERT INTO public.budget_recurring_rules
(user_id,id,name,category,amount,frequency,start_date,versions,account_id)
VALUES ('00000000-0000-4000-8000-000000000404','early-rule','Early rule',
'fixed',1,'monthly','2028-01-15','[]'::jsonb,'race-account');
\! touch "$workdir/insert-locked"
SELECT pg_sleep(2);
COMMIT;
SQL
worker=$!
for i in {1..100}; do [[ -e "$workdir/insert-locked" ]] && break; sleep .05; done
[[ -e "$workdir/insert-locked" ]] || { echo 'Insert worker never acquired FK lock' >&2; exit 1; }
if psql -X -v ON_ERROR_STOP=1 >"$workdir/delete.log" 2>&1 <<'SQL'
DELETE FROM public.budget_accounts
 WHERE user_id='00000000-0000-4000-8000-000000000404' AND id='race-account';
SQL
then echo 'Concurrent deletion bypassed referenced-account FK' >&2; exit 1; fi
grep -q 'violates foreign key constraint' "$workdir/delete.log" || { echo 'Delete failed for an unexpected reason' >&2; exit 1; }
wait "$worker"; worker=
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF (SELECT count(*) FROM public.budget_accounts WHERE user_id='00000000-0000-4000-8000-000000000404') <> 1
 OR (SELECT count(*) FROM public.budget_recurring_rules WHERE user_id='00000000-0000-4000-8000-000000000404' AND account_id='race-account') <> 1
 THEN RAISE EXCEPTION 'Insert-first race damaged account or recurring rule'; END IF;
END $$;
SQL
echo 'B3 concurrent FK insertion/deletion contracts passed'
