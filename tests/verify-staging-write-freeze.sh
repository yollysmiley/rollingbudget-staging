#!/usr/bin/env bash
set -euo pipefail
[[ "${PGHOST:-}" == 127.0.0.1 && "${PGDATABASE:-}" == migration_replay && "${PGUSER:-}" == postgres ]] || exit 1
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
python3 - "$work" <<'PY'
import re,sys,pathlib
blocks=re.findall(r'```sql\n(.*?)```',pathlib.Path('docs/STAGING_WRITE_FREEZE.md').read_text(),re.S)
assert len(blocks)==2
for name,block in zip(('freeze','restore'),blocks):
    pathlib.Path(sys.argv[1],name+'.sql').write_text(block)
PY
p() { psql -X -v ON_ERROR_STOP=1 "$@"; }
p -d postgres -c 'CREATE DATABASE freeze_fixture'
export PGDATABASE=freeze_fixture
p <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['budget_accounts','budget_data','budget_expense_categories','budget_recurring_rules','budget_ui_years'] LOOP
 EXECUTE format('CREATE TABLE public.%I (id integer PRIMARY KEY, amount integer)',t);
 EXECUTE format('INSERT INTO public.%I VALUES (1,100)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
END LOOP;
END $$;
GRANT ALL ON public.budget_data,public.budget_ui_years TO service_role;
SQL
snapshot() {
 p -qAt -c "SELECT relname,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname"
 p -qAt -c "SELECT c.relname,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 ORDER BY 1,2"
}
snapshot > "$work/before"
p -f "$work/freeze.sql"
p -qAt -c 'SET ROLE authenticated; SELECT amount FROM public.budget_accounts' | grep -qx 100
for stmt in 'INSERT INTO public.budget_accounts VALUES (2,200)' 'UPDATE public.budget_accounts SET amount=200' 'DELETE FROM public.budget_accounts' ; do
 if p -c "SET ROLE authenticated; $stmt" >"$work/error" 2>&1; then exit 1; fi
 grep -q 'permission denied' "$work/error"
done
if p -c 'SET ROLE service_role; TRUNCATE public.budget_data' >"$work/error" 2>&1; then exit 1; fi
grep -q 'permission denied' "$work/error"
p -f "$work/restore.sql"
snapshot > "$work/after"
diff -u "$work/before" "$work/after"
p -c 'GRANT UPDATE(amount) ON public.budget_accounts TO anon'
snapshot > "$work/drift"
if p -f "$work/freeze.sql" >"$work/error" 2>&1; then exit 1; fi
grep -q 'Staging freeze ineffective' "$work/error"
snapshot > "$work/rollback"
diff -u "$work/drift" "$work/rollback"
p -c 'BEGIN; SET ROLE authenticated; UPDATE public.budget_accounts SET amount=200; ROLLBACK;'
p -qAt -c 'SELECT amount FROM public.budget_accounts' | grep -qx 100
echo 'Synthetic freeze, denial, rollback and ACL restoration passed'
