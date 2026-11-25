#!/usr/bin/env bash
set -euo pipefail
umask 077
unset STAGING_DB_URL PRODUCTION_DB_URL PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
work=$(mktemp -d)
source_container="backup-source-$$"
target_container="backup-target-$$"
trap 'docker rm -f "$source_container" "$target_container" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
supabase --version
supabase db dump --help
for c in "$source_container" "$target_container"; do
  docker run -d --name "$c" -e POSTGRES_PASSWORD=fixture-only -p 127.0.0.1::5432 postgres:17 >/dev/null
  for i in $(seq 1 60); do
    if docker exec "$c" pg_isready -U postgres >/dev/null; then break; fi
    sleep 1
  done
  docker exec "$c" pg_isready -U postgres
done
sql() { docker exec -i "$1" psql -X -U postgres -v ON_ERROR_STOP=1 "${@:2}"; }
sql "$source_container" <<'SQL'
CREATE SCHEMA auth;
CREATE TABLE auth.users(id integer PRIMARY KEY);
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
CREATE ROLE fixture_owner NOLOGIN;
CREATE TABLE public.budget_data(user_id integer REFERENCES auth.users, state jsonb);
CREATE TABLE public.budget_ui_years(user_id integer REFERENCES auth.users, year integer);
ALTER TABLE public.budget_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_ui_years ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO fixture_owner;
GRANT SELECT ON public.budget_data, public.budget_ui_years TO fixture_owner;
CREATE POLICY owner_data ON public.budget_data TO fixture_owner USING(user_id=current_setting('fixture.owner')::integer);
CREATE POLICY owner_year ON public.budget_ui_years TO fixture_owner USING(user_id=current_setting('fixture.owner')::integer);
INSERT INTO auth.users VALUES(1),(2);
INSERT INTO public.budget_data VALUES(1,'{"fixture":1}'),(2,'{"fixture":2}');
INSERT INTO public.budget_ui_years VALUES(1,2026),(2,2027);
INSERT INTO supabase_migrations.schema_migrations VALUES('fixture');
SQL
# Managed auth schema is pre-created on the destination, as in Supabase.
sql "$target_container" <<'SQL'
CREATE SCHEMA auth;
CREATE TABLE auth.users(id integer PRIMARY KEY);
SQL
port=$(docker port "$source_container" 5432/tcp | cut -d: -f2)
[[ "$port" =~ ^[0-9]+$ ]]
url="postgresql://postgres:fixture-only@127.0.0.1:$port/postgres?sslmode=disable"
supabase db dump --db-url "$url" -f "$work/roles.sql" --role-only
supabase db dump --db-url "$url" -f "$work/schema.sql"
supabase db dump --db-url "$url" -f "$work/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
supabase db dump --db-url "$url" -f "$work/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$url" -f "$work/history_data.sql" --use-copy --data-only --schema supabase_migrations
files=(roles.sql schema.sql data.sql history_schema.sql history_data.sql)
(cd "$work" && sha256sum "${files[@]}" > SHA256SUMS)
age-keygen -o "$work/key" 2>/dev/null
tar -C "$work" -cf - "${files[@]}" SHA256SUMS | gzip -n | age -r "$(age-keygen -y "$work/key")" -o "$work/backup.tar.gz.age"
(cd "$work" && sha256sum backup.tar.gz.age > backup.tar.gz.age.sha256 && sha256sum -c backup.tar.gz.age.sha256)
mkdir "$work/restored"
age -d -i "$work/key" "$work/backup.tar.gz.age" | gzip -dc | tar -xf - -C "$work/restored"
(cd "$work/restored" && sha256sum -c SHA256SUMS)
for f in "${files[@]}"; do
  docker cp "$work/restored/$f" "$target_container:/tmp/$f"
done
sql "$target_container" --single-transaction -f /tmp/roles.sql -f /tmp/schema.sql -c 'SET session_replication_role = replica' -f /tmp/data.sql
sql "$target_container" --single-transaction -f /tmp/history_schema.sql -f /tmp/history_data.sql
sql "$target_container" <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM auth.users) <> 2 OR
 (SELECT jsonb_agg(state ORDER BY user_id) FROM public.budget_data) IS DISTINCT FROM '[{"fixture":1},{"fixture":2}]'::jsonb OR
 (SELECT array_agg(year ORDER BY user_id) FROM public.budget_ui_years) IS DISTINCT FROM ARRAY[2026,2027] OR
 (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='fixture') <> 1 THEN
 RAISE EXCEPTION 'Restore mismatch'; END IF;
END $$;
SET ROLE fixture_owner;
SET fixture.owner='1';
DO $$ BEGIN
 IF (SELECT array_agg(user_id) FROM public.budget_data) IS DISTINCT FROM ARRAY[1] OR
 (SELECT array_agg(user_id) FROM public.budget_ui_years) IS DISTINCT FROM ARRAY[1] THEN RAISE EXCEPTION 'Owner isolation failed'; END IF;
END $$;
SET fixture.owner='2';
DO $$ BEGIN
 IF (SELECT array_agg(user_id) FROM public.budget_data) IS DISTINCT FROM ARRAY[2] OR
 (SELECT array_agg(user_id) FROM public.budget_ui_years) IS DISTINCT FROM ARRAY[2] THEN RAISE EXCEPTION 'Owner isolation failed'; END IF;
END $$;
SQL
