# Dynamic Account Management — staging implementation contract

Status: Draft / implementation pending. This document is not a completed feature.

## Scope
- Replace hardcoded USAA and CPM selectors with user-managed account definitions, while preserving legacy records.
- Allow creating, renaming, and safely removing accounts.
- Assign income, expenses, and credit entries to an account.
- Exclude entries belonging to excluded accounts from every budget total, including month/year summaries and available balance; retain the underlying entries for display and editing.
- Preserve existing assignments during migration; never delete financial records as part of account migration.
- Enforce account ownership with Supabase row-level security and verify cross-user isolation.
- Maintain separate desktop and mobile views backed by shared account and calculation logic.

## Implementation order
1. Inspect active budget schema and current client serialization, legacy USAA/CPM references, and cloud save/restore.
2. Add additive schema migration, RLS policies, and migration/compatibility logic.
3. Implement shared account CRUD, assignment, and exclusion calculation helpers.
4. Wire Accounts Manager into Settings and account selectors into relevant entries on both layouts.
5. Add tests for migration, RLS, totals, deletion/reassignment, cloud persistence, and responsive views.
6. Run project test suite and CI, update README and CHANGELOG, and request review.

## Acceptance gates
- Existing data remains intact and correctly assigned after migration.
- Excluded-account entries remain visible but never affect budget totals.
- Account removal cannot orphan entries.
- Cross-user account and entry access is denied.
- Desktop/mobile regression suites and CI pass.
- Production remains untouched.

Do not merge until implementation and all acceptance gates are verified.
