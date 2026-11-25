#!/usr/bin/env bash
set -euo pipefail
umask 077
# No staging access outside the protected manual workflow.
[[ "${GITHUB_REF:-}" == refs/heads/main && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${BACKUP_CONFIRMATION:-}" == BACKUP ]] || exit 1
: "${STAGING_DB_URL:?}" "${BACKUP_RECIPIENT:?}" "${BACKUP_OUTPUT:?}"
# Require the exact staging tenant and session pooler port; never print the URL.
python3 - <<'PY'
import os, urllib.parse
def reject(reason):
    raise SystemExit("Unexpected staging connection configuration: " + reason)

try:
    u = urllib.parse.urlsplit(os.environ['STAGING_DB_URL'])
    port = u.port
except (ValueError, UnicodeError):
    reject("malformed connection string")
if u.scheme not in ('postgres', 'postgresql'):
    reject("invalid connection protocol")
if u.username != 'postgres.phiscfwfuzeptetimdbo':
    reject("incorrect staging project username")
if not u.hostname or not u.hostname.endswith('.pooler.supabase.com'):
    reject("invalid session pooler hostname")
if port != 5432:
    reject("expected session pooler port 5432")
if u.path != '/postgres':
    reject("incorrect database name")
if not u.password:
    reject("missing password")
if urllib.parse.parse_qs(u.query) != {'sslmode': ['require']}:
    reject("expected sslmode=require with no additional query parameters")
PY
# Validate the recipient before connecting to the database.
printf '' | age -r "$BACKUP_RECIPIENT" >/dev/null
# Require a fresh output directory to prevent publishing stale artifacts.
[[ ! -e "$BACKUP_OUTPUT" ]] || exit 1
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/encrypted"
# Suppress tool output: errors may contain connection details or row data.
dump() {
  if ! supabase db dump --db-url "$STAGING_DB_URL" "$@" >"$work/tool.log" 2>&1; then
    echo "Database export failed; no artifact published" >&2
    exit 1
  fi
}
dump -f "$work/roles.sql" --role-only
dump -f "$work/schema.sql"
dump -f "$work/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
dump -f "$work/history_schema.sql" --schema supabase_migrations
dump -f "$work/history_data.sql" --use-copy --data-only --schema supabase_migrations
files=(roles.sql schema.sql data.sql history_schema.sql history_data.sql)
for f in "${files[@]}"; do test -s "$work/$f"; done
printf '%s\n' 'Logical export; separate snapshots require a verified write freeze for cutover consistency. Auth configuration, storage objects and managed schema customizations require separate verification.' > "$work/coverage.txt"
files+=(coverage.txt)
(cd "$work" && sha256sum "${files[@]}" > SHA256SUMS)
tar -C "$work" -cf - "${files[@]}" SHA256SUMS | gzip -n | age -r "$BACKUP_RECIPIENT" -o "$work/encrypted/backup.tar.gz.age"
(cd "$work/encrypted" && sha256sum backup.tar.gz.age > backup.tar.gz.age.sha256)
mv "$work/encrypted" "$BACKUP_OUTPUT"
