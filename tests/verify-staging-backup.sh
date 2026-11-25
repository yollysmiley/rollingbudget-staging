#!/usr/bin/env bash
set -euo pipefail
root=$(pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin" "$work/tmp"
export TMPDIR="$work/tmp"
export PATH="$work/bin:$PATH"
export GITHUB_REF=refs/heads/main GITHUB_EVENT_NAME=workflow_dispatch BACKUP_CONFIRMATION=BACKUP
export STAGING_DB_URL='postgresql://postgres.phiscfwfuzeptetimdbo:synthetic@fixture.pooler.supabase.com:5432/postgres?sslmode=require'
age-keygen -o "$work/key" 2>/dev/null
export BACKUP_RECIPIENT=$(age-keygen -y "$work/key")
export BACKUP_OUTPUT="$work/output"
export CALLS="$work/calls"
cat > "$work/bin/supabase" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
echo called >> "$CALLS"
while [[ $# -gt 0 ]]; do
  if [[ "$1" == -f ]]; then
    printf 'synthetic fixture\n' > "$2"
    [[ "${FAIL_DUMP:-0}" == 0 ]] || exit 1
    exit 0
  fi
  shift
done
exit 1
MOCK
chmod +x "$work/bin/supabase"
reject() {
  if bash "$root/scripts/export-staging-backup.sh"; then
    echo 'Unexpected success' >&2; exit 1
  fi
  [[ ! -e "$BACKUP_OUTPUT" ]]
  [[ -z "$(ls -A "$TMPDIR")" ]]
}
( export STAGING_DB_URL='postgresql://postgres.awalptqpsjflrahkrjzk:fake@fixture.pooler.supabase.com:5432/postgres?sslmode=require'; reject )
( export STAGING_DB_URL='malformed'; reject )
( unset STAGING_DB_URL; reject )
( export BACKUP_RECIPIENT=invalid; reject )
[[ ! -e "$CALLS" ]]
( export FAIL_DUMP=1; reject )
bash "$root/scripts/export-staging-backup.sh"
[[ -z "$(ls -A "$TMPDIR")" ]]
[[ $(ls -1 "$BACKUP_OUTPUT" | wc -l) == 2 ]]
(cd "$BACKUP_OUTPUT" && sha256sum -c backup.tar.gz.age.sha256)
mkdir "$work/restored"
age -d -i "$work/key" "$BACKUP_OUTPUT/backup.tar.gz.age" | gzip -dc | tar -xf - -C "$work/restored"
(cd "$work/restored" && sha256sum -c SHA256SUMS)
for f in roles.sql schema.sql data.sql history_schema.sql history_data.sql; do
  grep -qx 'synthetic fixture' "$work/restored/$f"
done
age-keygen -o "$work/wrong" 2>/dev/null
if age -d -i "$work/wrong" "$BACKUP_OUTPUT/backup.tar.gz.age" >/dev/null 2>&1; then exit 1; fi
echo 'Synthetic export and encryption checks passed'
