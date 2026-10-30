# Release 2: state integrity integration

Status: integration patch prepared; not deployed or browser-validated. Issues 4, 6, 7, and 10 remain pending acceptance.

The build now runs integrateRelease2 after Release 1 rendering hardening. It embeds the existing state module in a private scope and replaces the legacy initialization, selectors, assignment calculations, cloud save/load, deletion handlers, and auth lifecycle with the Release 2 adapter. Source-boundary mismatches fail the build.

## Data policy

- Guest and each account use separate staging-only storage keys. Account changes clear the current budget and recurring modal before loading the next namespace.
- The verified legacy assignment field is bucketIndex: an integer paycheck index or excl_N. Migration resolves it to permanent paycheckId/excludedBucketId references and removes the legacy field. Deleted entities explicitly unassign affected expenses; other assignments remain unchanged.
- Guest budgets and unowned shared staging backups are not automatically attached to signed-in accounts. Old shared keys remain untouched and can be exported for ownership review.
- Malformed/unsupported local or cloud state blocks saving and offers a recovery export. No automatic destructive reset or overwrite is provided.
- Stale cloud reads cannot apply to a changed account. Cloud saves use captured account IDs and snapshots. Edits during cloud loading block saving rather than silently overwrite the cloud budget.

## Local checks performed

Node.js 20.20.1: state tests passed for legacy migration, migration idempotence, reference-preserving deletion, invalid-schema handling, incomplete-state normalization, guest/account storage separation, malformed-record preservation, and stale cloud-response rejection.

The integration transform matched the uploaded already-hardened application, and the generated application JavaScript passed node --check. This is not evidence of a complete pinned-source build or real browser/Supabase execution.

Run: node scripts/release2-state.test.mjs

## Remaining release gates

- CI build against the actual pinned upstream revision and existing Release 1 security regressions.
- Browser account A/logout/B, OAuth initialization, failed logout, delayed saves/loads, refresh, and multiple-tab tests using synthetic staging accounts.
- First/middle/last paycheck and excluded-bucket deletion; selectors and all financial totals.
- Browser recovery export, denied/full storage, malformed cloud data, recurring copies, and navigation.
- Explicit ownership-reviewed import of old unowned staging backups is not implemented; no silent migration into an account is allowed.

Production source, database, and credentials are unchanged. Synthetic staging data only.
