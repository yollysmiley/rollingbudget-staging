# Staging write-freeze preparation (NOT EXECUTED)

**Target:** staging Supabase project `phiscfwfuzeptetimdbo` only. **Purpose:** prepare a consistent logical export for release milestone 2. **Status:** read-only assessment and proposed SQL; no freeze, backup, restore, migration, production update, or merge authorized.

## Verified baseline (2026-11-25)

- PostgreSQL 17.11, public tables owned by `postgres`, RLS enabled: `budget_data`, `budget_ui_years`, `budget_accounts`, `budget_recurring_rules`, `budget_expense_categories`.
- Each has direct `authenticated` SELECT/INSERT/UPDATE/DELETE; `anon` has no table privileges. `service_role` has full table rights including TRUNCATE on only `budget_data` and `budget_ui_years`; no table grants on the other three.
- Exact ACL text captured read-only: `budget_accounts`, `budget_recurring_rules`, `budget_expense_categories` `{postgres=arwdDxtm/postgres,authenticated=arwd/postgres}`; legacy and year tables `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arwd/postgres}`. Preserve the detailed read-only ACL inventory externally at execution time and compare before restoring.
- No public functions, public user triggers, `pg_cron`, or `pg_net` detected. No active other backend at the instant sampled; this **does not establish absence of new sessions**.
- Eight Auth users, zero Storage buckets and objects; public row counts: legacy 0, years 2, accounts 8, recurring 1, categories 0. These are snapshots only, never evidence of zero concurrent writes.
- Supabase Auth has managed noninternal triggers and managed roles. `anon`, `authenticated`, `service_role` have write-capable grants on Storage objects/buckets; do **not** alter managed `auth` or `storage` grants as a shortcut.
- Staging migration ledger has ten versions as of audit. Backup workflow makes five sequential logical exports, not a unified database snapshot. It explicitly excludes Storage binary objects and external Auth settings. Supabase backups do not substitute for isolated recovery verification.

## Write paths to control BEFORE SQL

1. Schedule a maintenance window, prohibit interactive use of the staging application, stop new sign-ups, password resets, account deletions and user modifications during the backup window. Owner must confirm how to control Auth through supported dashboard settings rather than ad hoc managed-schema revokes. Because Auth user deletion may cascade to budget data, absence of budget client writes alone is not enough.
2. Stop or otherwise disable the `live-staging-tests.yml` workflow's main-push automatic run and manual dispatch, and avoid `logout-diagnostics.yml`; both use staging credentials. Record how to re-enable them afterward. Do **not** alter the existing workflow without a separately approved PR. Avoid `main` pushes, protected job starts, CI test users and migration deployments for the entire window.
3. Stop any server-side service-role jobs, direct PostgreSQL writers, admin/dashboard editing and other integrations. GitHub workflow inventory alone cannot verify external writer processes or owner/admin access.
4. Inventory Supabase Auth settings, provider configurations, external mail, Storage configuration, and storage object availability separately. The present zero buckets/objects is a snapshot and can change. Do not claim a managed complete backup from the SQL archive.
5. Preflight: obtain a fresh privileged grant inventory; ensure it matches baseline, all changes are authorized, maintenance is active, app writes are quiescent, and there is a validated restoration path. If any cannot be established, STOP; do not create the backup.

## Operational execution checklist (separate approval required)

- Record workflow enabled states; disable both credentialed workflows in GitHub Actions, cancel queued runs and allow active jobs to finish cleanup before proceeding. Verify no queued, waiting or running credentialed jobs remain. Do not push to main during maintenance. Backup and live tests have different concurrency groups.
- Prepare disposable test fixtures before maintenance. Stop clients, including background token refresh, and confirm supported controls for existing sessions, signup, password reset, Auth administration and Storage. Disabling signup alone is insufficient. If managed Auth writes cannot be controlled or demonstrated quiescent, STOP; do not claim a consistent export. Do not revoke managed-schema permissions.
- Capture raw relation and column ACLs, owners, role memberships, and expanded ACL entries (grantor, grantee, privilege, grant option) using pg_class.relacl, pg_attribute.attacl and aclexplode; save privately outside GitHub. Compare to the named baseline; STOP on drift or independent column write grants. Record exact reversal before applying anything.
- Inspect pg_stat_activity and pg_locks for active and idle-in-transaction writers and prepared transactions; drain them through their owners. Do not terminate managed sessions blindly. The bounded ACCESS EXCLUSIVE lock below drains conflicting transactions on the five tables before revocation; on timeout roll back and investigate. It is released at commit and is not a persistent lock against privileged writers.
- Capture private deterministic per-table counts and SHA-256 digests of canonical row streams (SELECT to_jsonb(t)::text FROM schema.table t ORDER BY to_jsonb(t)::text COLLATE "C", streamed via psql -X -qAt into sha256sum with pipefail). Include exported Auth/Storage data and migration history where accessible; never log row contents. Repeat after export before unfreeze; compare counts, digests and migration versions. Record UTC timestamps and exact scope. Any mismatch or inaccessible required scope blocks acceptance.
- The backup script does not check freeze state. Owner must record the verified ACL, quiescence and checksum evidence before manually dispatching it. Keep the maintenance window active until export completion and verification. On timeout, failure, invalid archive or drift, reject the artifact, stop migration, and obtain owner approval for exact restoration of grants and workflow states; retry only after a new verified freeze. Do not leave staging indefinitely frozen while troubleshooting.

## Proposed application-table freeze SQL — human review only

The following statements are **NOT approved for execution**. They are a draft applying only to the five public budget tables. Lock/transaction blocking and outstanding privileged writes require separate operational validation.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.budget_accounts, public.budget_data, public.budget_expense_categories, public.budget_recurring_rules, public.budget_ui_years IN ACCESS EXCLUSIVE MODE;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.budget_accounts,
  public.budget_data,
  public.budget_expense_categories,
  public.budget_recurring_rules,
  public.budget_ui_years
FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.budget_data, public.budget_ui_years
FROM service_role;

-- Hard-stop if effective permissions are still reachable through role
-- memberships, PUBLIC grants, or column-level grants.
DO $$
DECLARE role_name text; rel regclass;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH rel IN ARRAY ARRAY[
      'public.budget_accounts'::regclass,
      'public.budget_data'::regclass,
      'public.budget_expense_categories'::regclass,
      'public.budget_recurring_rules'::regclass,
      'public.budget_ui_years'::regclass
    ] LOOP
      IF has_table_privilege(role_name,rel,'INSERT')
      OR has_table_privilege(role_name,rel,'UPDATE')
      OR has_table_privilege(role_name,rel,'DELETE')
      OR has_table_privilege(role_name,rel,'TRUNCATE')
      OR has_any_column_privilege(role_name,rel,'INSERT')
      OR has_any_column_privilege(role_name,rel,'UPDATE') THEN
        RAISE EXCEPTION 'Staging freeze ineffective: % %',role_name,rel;
      END IF;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
```

**Important:** Table-level revocation does not necessarily eliminate independent column-level INSERT/UPDATE grants. Prior audit used effective column checks, which also reflect table grants; before execution inventory `pg_attribute.attacl` directly, and STOP if independent write grants are present; prepare a separately reviewed exact reversal rather than improvising. The DO guard above is not a substitute for verifying column grants and direct API write-denial. No column-level exceptions were proven absent by the previous check. Admin/owner and managed platform services retain write ability. A privileged administrator could still modify Auth records or tables, so the operator must enforce the human/operational freeze throughout the multiple dumps.

## Proposed exact-baseline unfreeze SQL — human review only

Only if the fresh ACL inventory matches the verified starting state and no grants have changed, the initial targeted restoration is:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT INSERT, UPDATE, DELETE ON TABLE
  public.budget_accounts, public.budget_data,
  public.budget_expense_categories, public.budget_recurring_rules,
  public.budget_ui_years TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.budget_data, public.budget_ui_years TO service_role;
COMMIT;
```

**Restore by exact before/after ACL diff**, not by running these blindly: they assume the captured baseline and no independent column grants or concurrent migrations. `SELECT`, existing RLS policies, identities and managed-schema grants remain intact. Restore normal access only after backup verification and separate owner approval, and re-enable credentialed integration only after restoration and proper test timing.

## Verification and stop gates

Before backup, verify effective table and column write privileges, a denied authenticated write **using a synthetic disposable account prepared before the freeze, with transaction rollback and no new Auth login during the export window**, a successful read, unchanged baseline row counts/checksums, migration ledger, no in-flight writers, and Auth/Storage quiescence. RLS alone is not sufficient; `service_role` bypasses RLS and can TRUNCATE if grants remain. If any write path remains open, STOP.

Once frozen and separately approved: dispatch `Authorized staging backup` manually on `main`, confirmation `BACKUP`; never expose `STAGING_DB_URL`, plaintext SQL or private Age identity to GitHub logs or PR CI. Download encrypted archive plus sidecar before 7-day expiry, verify outer SHA256 and inner manifest after owner-controlled decryption, store offline. CI only restored **synthetic** data; real archive restoration to a separate disposable environment still requires explicit approval and practical secure execution, or explicit waiver by owner. Never restore over staging or production. No staging migration or production change is authorized by this document.

## Test and CI impact

The disposable PostgreSQL contract extracts the two SQL blocks from this runbook and checks denial, reads, exact ACL restoration and rollback on unexpected column grants. It runs only against the local CI PostgreSQL service. Existing backup and desktop/mobile checks remain unchanged. No live freeze or actual archive recovery is performed.
