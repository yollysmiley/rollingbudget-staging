# Financial write and reconciliation contract (A3 / issue #52)

Status: staging implementation in progress. This contract governs budgets, accounts, and recurring rules without merging their distinct storage services or desktop/mobile view trees. No production change is authorized by this document.

## Shared invariants

1. **Owner scope:** every query and mutation is scoped to the authenticated `user_id`; never infer ownership from a local document or a UI-selected account. Account changes, navigation, reloads, and sign-out must not migrate a pending write to another owner.
2. **Account-switch readiness:** a newly selected owner must have both an authoritative budget year and their owner-scoped account catalog loaded before rendering or permitting edits. The prior owner's UI remains hidden throughout the switch. A failed catalog fetch leaves the UI gated, never rendering with stale or empty account metadata.
3. **Authoritative revision:** read the server's current revision before modifying an existing row; compare against the revision or source snapshot on which the edit was based. A mutation must condition on that same revision and treat zero affected rows as a conflict. A timestamp used only as a new value does **not** prevent lost updates.
3. **First write:** insert new rows with the owner and stable resource key. Let unique constraints reject concurrent first inserts; never use a generic upsert to overwrite a resource with an unknown revision.
4. **Immutable local snapshots:** take a copy of each submitted budget document at edit time. Queue writes per owner/year to preserve local order. A stale snapshot must not silently replace a diverged cloud document, including after reload, retry, or background recurring synchronization.
5. **Conflict is durable and explicit:** a failed or ambiguous budget write preserves its browser snapshot, records an owner/year conflict marker, and blocks automatic cloud overwrite. Only an explicit user choice after safe backup may reconcile local versus cloud. Account and rule conflicts return an actionable error rather than silently overwriting remote fields.
6. **Partial success:** distinguish (a) cloud budget commit succeeded, (b) local-cache update failed, and (c) recurring backfill deferred. Do not re-label a committed budget as failed solely because a downstream recurring operation needs retry.
7. **Idempotent scheduling:** recurring occurrence IDs and rules remain owner-scoped. Reapply missing occurrences from the rule's effective start date without duplicates or modification of historical entries. Pending scopes survive sign-in/reload, and retries obey the same budget revision check.

## Current persistence contracts and phase gates

| Resource | Revision / compare-and-set | Safe conflict behavior | Implementation gate |
| --- | --- | --- | --- |
| Budget year | `budget_ui_years.updated_at` plus `user_id, year` | preserve local snapshot and owner/year conflict marker; explicit reconciliation | `scripts/budget-revision.mjs`, `saveDB`, year-copy and migration tests |
| Account | server `budget_accounts.updated_at` plus `user_id, id`; verify caller's source account values | reject stale edit/delete; reload catalog before retry | `scripts/account-storage.mjs`, account manager tests |
| Recurring rule | versions JSON compare-and-set plus `user_id, id` | reject stale version edits/deletions; do not rewrite history | `scripts/recurring-app-service.mjs`, rule mutation tests |
| Recurring budget backfill | server-authoritative year with `updated_at` CAS | durable pending reconciliation or retry; backfill never assumes local browser cache is canonical | `commitRecurringYear`, `backfillSavedRecurringYears`, recovery tests |

## Required failure matrix

- **Concurrent update:** two devices read the same row, then each modifies it; the second write must fail deterministically with no remote overwrite.
- **Owner change:** an in-flight operation cannot affect a newly signed-in owner or carry old-owner errors into the new UI.
- **Unknown insertion:** duplicate new account, budget year, or recurring-rule ID is rejected, not silently upserted.
- **Disconnection and reload:** local data and conflict markers remain accessible; reconnection does not automatically select a winner.
- **During reconciliation:** desktop/mobile budget edits are blocked before mutating memory; preserve the original snapshot until explicit recovery completes (issue #46 prerequisite).
- **Partial recurring failure:** successful budget commits remain acknowledged while pending recurring scopes are retried idempotently after reload.
- **Account deletion:** no referenced account may be removed. DB-enforced recurring-rule references are tracked separately in B3 (#48).

## Validation / rollout

Review and update the existing node unit, browser, live staging integration, RLS/security, and build checks for each touched module before committing; use isolated synthetic owners and empty account lists. Test desktop and mobile navigation/editing separately. Run required CI on every staging PR; run credentialed multi-context tests when the workflow and test secrets are available. Never close #52 until every criterion above is covered by passing tests, and do not merge without user approval.

This document complements, rather than replaces, the actual database RLS policies. A disposable PostgreSQL migration replay does not validate authenticated Data API isolation.
