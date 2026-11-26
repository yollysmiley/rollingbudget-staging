# Issue 92 alignment

Source: production a7a8597aa11eee684ede19a9489c17d4f489a38b; staging baseline fe9caf624b536eba29609f4bc8a6fdb7cc1cf5fa. Owner confirmed production acceptance.

## Before live migration (separate approval)
- Recheck staging HEAD, migration ledger and schema; expect ten existing versions and six pending November 25 versions.
- Follow STAGING_WRITE_FREEZE.md and STAGING_BACKUP.md. Verify writer isolation, encrypted backup, restoration rehearsal and deterministic per-table row digests. Do not expose financial data in CI logs.
- Rehearse all six original migrations in timestamp order on an isolated restored database. Check strict extractors, owner-scoped references, legacy account initialization and old frontend compatibility. Expected baseline: 2 years, 8 accounts, 1 rule, 0 categories, 0 legacy rows; refresh before execution.
- Obtain explicit live migration approval. Stop on any failure; inspect committed schema and ledger before recovery or continuation. Never blindly replay or repair history. Restore only under approved recovery procedure.

## After migration, before frontend activation
- Verify sixteen ledger versions, four private reference tables, validated foreign keys, RLS, owner policies, restricted schema/table/function grants and exact financial document equality. Any account additions must match approved recognized legacy references.
- Verify old frontend saves and deletion behavior; test stale revisions, cross-owner access and embedded/historical references. Keep existing staging workflows and protected tests.
- Require all applicable PR CI, separate merge/deployment approval, and protected main-only desktop/mobile live validation after merge. Do not close #92 until evidence is recorded.

No live migration, backup, freeze, merge or deployment is authorized by this document.
