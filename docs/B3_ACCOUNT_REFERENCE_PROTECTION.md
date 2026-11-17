# B3 — Global recurring-rule account reference protection

## Live staging inventory (read-only, 2026-11-16)

- Existing global recurring-rule rows: **1**
- Rules with non-null `account_id`: **1**
- Rules with an unresolved owner/account pair: **0**
- Existing recurring schema has the owner-scoped primary key on `(user_id,id)` but **does not yet enforce** the account pair `(user_id,account_id)`.
- Account storage already has a unique/primary key on `(user_id,id)`.

These counts are not user data exports. Re-run a read-only inventory immediately before applying the migration; new rules may have been added in the meantime.

## Integrity contract

- Account deletion first checks saved budgets and every global rule for the same owner/account, including disabled, future-starting and historical rules. No rule is removed or reassigned implicitly.
- A verified **composite** PostgreSQL FK `(user_id, account_id) → budget_accounts(user_id,id)` with `ON DELETE RESTRICT` prevents a deleted account or cross-owner relationship even if concurrent transactions make the application preflight stale.
- Nullable `account_id` is preserved. PostgreSQL's default MATCH SIMPLE permits null.
- A preflight scan aborts migration if a missing or cross-owner account reference exists. A rejected migration leaves data unchanged because changes are transactional.

## Pre-apply remediation

1. Query only counts and owner-scoped IDs for rules whose `account_id` does not match an account for the *same owner*. Do not copy production or historic users into tests.
2. If orphan references exist, stop the deployment and investigate ownership: restore a legitimate missing account or obtain explicit authorization to change/remove an obsolete rule.
3. Do **not** delete recurring entries, rewrite budget history, cascade deletions, or silently assign a different owner's account.
4. Review the separate account-revision work in #52 before integrating this PR, since both modify `scripts/account-storage.mjs`.

## Rollback / failure

The migration uses `BEGIN`/ `COMMIT`, validates existing data, and refuses to apply to an orphaned dataset. An unsuccessful migration should be retried only after safe remediation.

If a successful migration must be reversed under approved operational change management, drop only `public.budget_recurring_rules.budget_recurring_account_owner_fk` in a separately reviewed forward migration. Dropping the constraint relaxes future protections and is not an automatic rollback. The existing accounts and rules must remain untouched.

## Test matrix

- Unit: disabled, future and historical global references block deletion; owner mismatch does not block an unreferenced account; query failure fails closed; a concurrent FK violation does not delete the account.
- Desktop/mobile browser: both views show confirmation and a blocked-removal status when the account has global recurring dependencies.
- Isolated PostgreSQL 17: cross-owner account reference fails, deleting a referenced account fails, unrelated unreferenced account deletes, and failed deletion preserves both records.
- CI: replay all seven SQL migrations on a disposable database, assert the validated FK, then run the B4 RLS/date/FK contract. No production or staging writes.

The installed Supabase CLI was not available in the execution environment. The forward migration file follows the established versioned SQL format but should be verified with `supabase migration list` in Codespaces before merge. Never edit applied migration-history rows to accommodate a filename.
