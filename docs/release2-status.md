# Release 2: state integrity

Status: foundation only; NOT integrated, tested, or deployed. Issues 4, 6, 7, and 10 remain open.

The release2-state module provides separate guest/account storage keys, account-generation tokens for rejecting stale writes, guarded versioned reads, preservation of invalid stored records, immutable stable-ID deletion, and a month-normalization primitive.

## Required integration before release

- Obtain the complete pinned application source and verify its actual state schema. The primitive currently expects paychecks, excludedBuckets, expenses, paycheckIndex, and excludedBucketIndex; these names are an explicit proposed interface, not a verified legacy migration.
- Implement and test a whole-budget validator and migrations using the application's actual legacy fields, years, months, recurring templates, dates, and selected indices. Do not feed legacy records into the new storage automatically.
- Wire account changes and logout to immediate in-memory and UI clearing, modal reset, account-store selection, and cloud-response generation checks. Tokens alone do not clear memory or prevent stale rendering.
- Wire all creators, selectors, calculations, recurring copies, cloud reads/writes, and deletion handlers to stable IDs. Deleted references become null; expose an unassigned state in the UI.
- Add recovery UI and an explicit export/reset flow. Failed validation must not overwrite the saved record. Handle storage failures without claiming success.
- Integrate through the existing staging build without removing Release 1 rendering hardening.

## Acceptance tests still required

- Account A/logout/B; guest transitions; delayed cloud reads and writes; refresh; multiple tabs.
- First/middle/last deletion with unrelated references unchanged.
- Actual legacy migration; repeat migration; invalid and duplicate IDs.
- Malformed JSON; missing structures; invalid dates and indices; unsupported versions; storage failures.
- Existing rendering/security regressions and browser-level calculation checks.

Production remains out of scope. Synthetic staging data only. No passing test or issue-resolution claim is made by this commit.
