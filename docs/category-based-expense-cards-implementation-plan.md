# Phase 3 — Category-based expense cards: implementation plan

Status: **Approved; implementation incomplete.** Staging PR #78 only. Do not merge without explicit approval.

## Product contract
- Each expense card is an independent user-defined category; Fixed and Variable are legacy default cards, **not financial classifications**.
- All cards have identical calculation behavior. Category identity is a stable ID, not a display name.
- Existing budget records, account associations, recurring rules, and historical amounts must be preserved.
- New users begin with no account records or budget transactions; create test data explicitly.
- A category cannot be deleted while any saved year or recurring rule references it; inability to verify references blocks deletion.

## Increment 1 — Compatibility model and migration
- Review existing `rollover-budget-app.html`, `scripts/expense-category-model.mjs`, `scripts/expense-category-storage.mjs`, and Supabase migration files.
- Define a normalized expense-entry representation containing `categoryId`; document exact existing expense-entry fields before implementing a conversion.
- Provide a pure, deterministic, idempotent adapter for legacy `month.fixed` and `month.variable` entries. Never count both legacy and migrated copies.
- Retain legacy data during rollout; only retire old fields after read/write parity and rollback verification.
- Ensure category definitions are global to the owner while expense entries remain month/year scoped.
- Review/update migration manifest, B1 clean replay, B3 populated upgrade, B4 owner isolation/RLS, and all affected fixtures.

## Increment 2 — Distinct desktop and mobile expense-card views
- Implement shared category and expense-entry state with separate desktop and mobile view components/containers.
- Render one card per category, including the two legacy defaults until a separately approved default-card migration.
- Support adding, editing, and removing expense entries in each card, preserving due date, amount, account association, and any existing transaction metadata.
- Keep existing desktop and mobile navigation and responsive behavior; avoid duplicate form IDs and unscoped event handlers.
- On category rename, update only the category label, not expense IDs or recurring associations.

## Increment 3 — Financial calculation parity
- Refactor the calculation boundary so all expense entries across categories are aggregated once.
- Preserve existing income, credit-card, loan, account-inclusion, carryover, rollover, year-copy, and month-selection semantics.
- Add parity tests with existing legacy budgets; test zero-dollar, excluded accounts, multiple cards, month/year transitions, and no duplicate counting.
- Ensure a cloud conflict cannot silently overwrite a newer budget snapshot.

## Increment 4 — Recurring rules
- Extend recurring expense rules with stable `categoryId` references, with a compatibility adapter for legacy `fixed`/`variable` rule categories.
- Preserve effective-dated edits, start/end dates, frequency, backfill behavior, and idempotent generated entries.
- Place generated entries in the referenced card and count them once.
- Validate owner-scoped category references; block deletion if any active, disabled, historical, or future rule references the category.
- Review the recurring-rule database constraints and migration path before writing schema changes.

## Increment 5 — Verification and release gate
- Review and update all existing unit, browser, authenticated, integration, and regression tests affected by changed fields, selectors, calculations, and workflows.
- Add isolated desktop and mobile coverage for create/edit/remove, rename, persistence, refresh, account switching, responsive layout, and recurring backfills.
- Add migration tests for populated and empty accounts, cross-owner RLS, failed cloud reads, concurrent writes, and rollback/retry.
- Run lint/type checks, relevant tests, full local suite where supported, and all required GitHub Actions.
- Record files changed, tests reviewed/modified/added, validation results, CI status, and any unverified checks.
- Update README/changelog; request explicit approval before merge.

## Implementation state at plan commit
- Existing PR #78 has category definitions, owner-scoped category storage, Settings create/rename/delete controls, and a forward-only migration making the old `kind` column optional.
- **Not implemented yet:** category-based monthly expense storage, dynamic budget cards, unified calculations, and stable category references in recurring rules.
- This plan commit is not a claim that the feature is complete.
