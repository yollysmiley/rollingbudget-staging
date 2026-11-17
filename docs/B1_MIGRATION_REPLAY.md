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

The two version discrepancies are **not** corrected by renaming previously applied files. The applied account and recurring-rule SQL statements were inspected and match the repository statements apart from formatting/comment differences. Exact historical checksums cannot be reconstructed from the migration-history API alone; preserve the recorded staging history.

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
