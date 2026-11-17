# B1 — Clean staging migration replay

This PR adds a **secret-free, disposable PostgreSQL 17** GitHub Actions check. It does not connect to Supabase staging or production, and it does not modify deployed migration history. The workflow provisions a fresh `migration_replay` database and a minimal `auth.users`/`auth.uid()` shim for schema compatibility, replays repository migrations in filename order, and verifies the resulting tables, RLS, policy ownership predicates, indexes, and recurring date constraints.

## Applied staging history versus repository

| Repository migration | Applied staging version |
| --- | --- |
| 20261029194718_create_staging_budget_data.sql | 20261029194718 |
| 20261114184318_create_budget_ui_years.sql | 20261114184318 |
| 20261114192802_harden_public_default_privileges.sql | 20261114192802 |
| 20261114221500_create_budget_accounts.sql | **20261114221703** |
| 20261115043000_create_budget_recurring_rules.sql | **20261115043822** |
| 20261116172229_add_recurring_due_day_and_full_dates.sql | 20261116172229 |

The two version discrepancies are **not** corrected by renaming previously applied files. The applied account and recurring-rule SQL statements were inspected and match the repository statements apart from formatting/comment differences. These are the applied statement-array digests exposed by the staging migration-history table (read-only query); they are **not** hashes of the original migration files or a substitute for comparing SQL semantics. Preserve the recorded staging history.


## Applied staging statement fingerprints

Read-only snapshot of `supabase_migrations.schema_migrations` (2026-11-16 UTC). Each applied migration has one recorded statement. The digest is `md5(array_to_string(statements, E'\\n'))`, which is reproducible from the *stored statement array* but is not a checksum of the repository file bytes.

| Staging version | Applied-statement MD5 |
| --- | --- |
| 20261029194718 | `1c6abf6438d2bcdbd491e5834e6d2ded` |
| 20261114184318 | `7170a14d1024a0af6cf73dafe166e097` |
| 20261114192802 | `69acd09ce8bc8d1d83ec0e61857a45c9` |
| 20261114221703 | `b2eab2f8e2907c8024b067876d9e856d` |
| 20261115043822 | `3fadc29eb5281d7cea83626e6c07a640` |
| 20261116172229 | `29bc9155f2b372256ad34d93c44cd3b6` |

Re-run the same read-only inventory before any history reconciliation. Never assume a mismatched version identifies missing schema changes: verify the actual applied statements and schema contract.

## Non-destructive repair and rollback procedure

1. **Freeze and inventory:** record staging migration versions, statement fingerprints, live schema objects, constraints, indexes, and RLS policies before changes. Keep a database backup/recovery plan that preserves user budget records.
2. **Reproduce on a disposable database:** run the six committed migrations in order using this replay workflow. Compare the resulting schema contract and the semantically corresponding staging-applied SQL; investigate any difference before adding B2/B3 constraints.
3. **Resolve history differences without rewriting applied records:** retain the existing staging `schema_migrations` versions `20261114221703` and `20261115043822`. Do not rename old applied migrations or delete/update staging history to force CLI alignment. If a structural difference is confirmed, introduce a separately reviewed **forward-only, idempotent** migration with a new version.
4. **Rollback if a new migration fails:** stop deployment; preserve original data, diagnose the failing statement, and prefer a reviewed forward fix when possible. For unrecoverable destructive changes, use a verified database restore to a recovery point rather than attempting ad hoc history edits. Verify RLS/ownership after recovery.
5. **B2/B3/B4 gate:** replay each proposed new migration in this empty database, validate populated-data migration cases in staging-safe tests, and independently verify real cross-user RLS and account references before applying constraints to staging.

This procedure does not claim that the disposable PostgreSQL shim tests the full Supabase platform or restores user budget data.

## Scope and limitations

- The replay checks PostgreSQL schema consistency, not Supabase Auth runtime or Data API behavior. Live cross-user RLS tests belong to #53.
- This local shim is not a complete Supabase stack. It verifies schema migrations using the same PostgreSQL major version as staging, but does not certify extension-specific Supabase behavior.
- When adding migrations, update the expected migration count and schema-contract assertions deliberately.
- Do not run the replay script against a real Supabase project. It refuses non-local hosts and any database other than `migration_replay`.
- Required existing `build` and `validate` checks remain unchanged; the new `migration-replay` job is additive.
- Follow-up B2/B3 migrations must be validated against this clean replay and the credentialed staging tests before merge.

## Local run

With a disposable PostgreSQL 17 instance listening on localhost and an **empty** database named `migration_replay`, set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` and run:

```sh
bash scripts/verify-clean-migration-replay.sh
```

Use the GitHub Actions workflow as the primary reproducible CI check.
