## Unreleased

- Phase A2 step 4 (staging): preserve generated recurring entries when copying manual plans into future years, avoid exact scheduled duplicates, serialize year-planning actions, roll back unsaved browser-storage failures, and backfill global rules when a local-only year is first inserted through cloud reconciliation. Correct the isolated Supabase browser fixture to avoid silently seeding cloud rows; extend unit and desktop/mobile tests for first-save, recovery, idempotency and failure paths. No schema or production changes.

- Phase A2 step 3: opt-in December-to-January projected opening balance with confirmation, nonzero manual opening protection, and desktop/mobile and unit regression tests. No schema changes.

- Phase A2 steps 1–2 (staging): add a pure year-plan copy module and distinct desktop/mobile **Copy Previous Year’s Plan** actions, requiring confirmation and protecting existing entries, recurring occurrences, historical debt balances, and account assignments. Add unit and responsive browser regression coverage. No schema changes.

- Phase A1 (staging): automatically expose the current year plus two future years, discover all older saved and owner-scoped unsynced years, preserve diverged local budgets instead of choosing by timestamps, remember the selected year per user/session, and move distinct desktop/mobile year selectors outside Settings. Remove manual New Year controls, apply global recurring rules after a virtual year's first successful cloud save, and update impacted unit/browser regression tests. No database schema changes.

- Staging: wait for the mobile navigation drawer to finish entering the viewport before SPA route test clicks; add explicit desktop/mobile recurring date-field acceptance tests and a staging build guard against reintroducing Due day / Start month controls. The live site still requires a successful staging deployment to receive these changes.

- PR #42 Phase 5 staging: harden recurring-cloud snapshot comparison for PostgreSQL jsonb key reordering and equivalent timestamptz representations, preserving nanosecond-precise revision checks and conditional updates. Add unit, desktop, and mobile regression coverage and document remaining pre-merge live-staging verification.

- PR #42 Phase 4 staging: show owner-scoped recurring sync results (added, already present, possible duplicates and deferred years) separately on desktop/mobile, persist incomplete date ranges within the session and provide safe retry that re-reads authoritative cloud data and preserves existing conflict checks. No manual preview or apply controls restored.

- PR #42 Phase 3 staging: connect future-effective recurring edits and reactivation to automatic missing-entry synchronization; disabling preserves existing entries. Display upcoming changes in distinct desktop/mobile views, synchronize global rules on new budget-year creation, and prevent accidentally replacing an existing year. Add service and browser regression tests.

- PR #42 staging: restrict automatic recurring backfill to owner-saved cloud years, explicitly save only the selected eligible year on rule creation, pin cloud revisions during synchronization, and preserve unsynced local changes with conflict recovery. Added service and desktop/mobile regression coverage. Existing saved entries are never rewritten; no production changes.

- Temporarily permitted protected manual live integration on PR #33 for pre-merge verification; restored the workflow's main-only execution gate before merging.

- Adopt the committed npm v3 lockfile in all staging CI workflows with `npm ci` and lockfile-keyed npm download caching; retain `--ignore-scripts` for secret-free and credentialed live validation. No change to required check names or deployment gates.

- Harden staging live integration account cleanup with run/owner/name verification before deletion, checked DELETE results and post-delete absence; add regression tests for ownership mismatches. Document CI workflow ownership and safe prerequisite for a future lockfile/cache change.

- Separate live authenticated persistence fixtures from legacy migration: seed a run-scoped modern account and `amount`/`accountId` income, verify Supabase persistence and fresh-context restoration, and clean up only the test-owned account after deleting its budget. Dedicated browser and unit migration regressions continue to cover legacy CPM/USAA records.
- Reduce staging CI duplication by running live safety unit tests in the primary build only, cancel superseded PR builds without cancelling main deployments, and retain Playwright reports on failure rather than every successful run. Required `build` and `validate` checks remain unchanged; live credentialed workflow remains isolated.
- Staging: seed legacy accounts only when referenced by budget data; allow empty catalogs and unassigned income, and align desktop/mobile income-entry fields. Added regression tests.
- Harden account migration against missing legacy accounts and local cache failures; enable editable account-linked income amounts and add regression coverage.

- Strengthen legacy-income migration browser regression by asserting both editable income rows render after reload; preserve account split, totals, metadata and idempotency checks.

- Automatically migrate legacy CPM/USAA income to account-linked entries after authenticated data loading; preserve source amounts and metadata, create a pre-migration local backup, and skip already-migrated records. Removed manual Split Income UI and updated Playwright and unit regression tests.

- Phase 3 acceptance corrections: safeguard mixed-source legacy income with explicit splitting, simplify new income account assignment, show account selection for all recurring rule types, and initialize accounts on authenticated refresh. Added regression coverage.

- Phase 3 (in progress): introduced account-aware rolling totals and exclusion handling, including legacy CPM/USAA income compatibility and regression tests. Dynamic transaction account selectors and recurring-rule migration are still pending.

- Phase 2 Accounts Manager: distinct desktop and mobile Settings interfaces, authenticated account CRUD, guarded deletion, bundled browser account modules, and regression tests. Account inclusion affects totals only after the account-aware budgeting phase.
- Phase 1 account storage: added user-scoped `budget_accounts` SQL migration with RLS, idempotent legacy account initialization helpers, and regression tests. Existing year documents remain untouched until the account-aware UI is ready. Staging database application is pending verification.


- Added isolated account-model helpers and unit tests for legacy income migration, exclusion totals, and referenced-account removal safeguards. Not yet integrated into the budget UI or cloud persistence.

- Staging draft PR #31: moved desktop year selection, New Year, Auto-Cascade and Recurring Rules controls into a Settings view; added navigation contract tests. Dynamic account management remains unimplemented.

# Changelog

## Unreleased

- Corrected public homepage Forgot Password to request an email and send a Supabase recovery link rather than navigating directly to the token-only reset page; updated desktop/mobile regression coverage.

- Fixed staging password recovery callback timing so delayed Supabase events do not immediately appear expired; added recovery token-hash verification and desktop/mobile regression tests. No production changes.

- Restored the approved Rolling Budget logo, purple styling, responsive spacing, and account-mode navigation in public sign-in and registration dialogs, with desktop/mobile regression tests.
- Corrected the invalid logout URL assertion syntax in live authenticated acceptance.

- Updated live authenticated acceptance to bootstrap Supabase sessions before entering the protected `/app/` route, verify cloud restore and account isolation, and assert public-homepage redirects after logout.

- Fixed browser sign-out regression tests to explicitly accept native confirmation dialogs and added desktop/mobile coverage for cancelling sign-out.

- Fixed the simulated auth client to persist sign-out state across page navigation, preventing the public homepage from immediately re-authenticating after logout.

- Updated remaining signed-out browser assertions for authenticated owner-scoped storage, account status, and desktop/mobile sign-out navigation.

- Updated desktop and mobile browser acceptance tests to use an isolated simulated signed-in Supabase client, while separately asserting public homepage behavior and anonymous app redirects.

- Added a public responsive Rolling Budget homepage and an authenticated app entry at `/app/`. Unauthenticated app visitors are redirected to the homepage and sign-out clears the rendered budget. The legacy app URL remains guarded for compatibility.

- Serialized staging cloud saves per account and year using immutable budget snapshots to prevent earlier edits overwriting later ones. Show an accessible warning when cloud sync fails while preserving local data; added ordering and failure regression tests and strengthened authenticated save assertions.

- Avoid attempting a second logout of a browser-revoked Supabase session in the live authenticated test teardown. Keep owner-verified fixture cleanup, and report the failing teardown phase without exposing tokens or budget data. Added regression coverage.

- Fixed live authenticated browser fixture cleanup after UI logout by signing in again with the dedicated test account, verifying the original owner, deleting only rows marked by the current test run, and signing out the cleanup session. Added regression coverage for identity mismatches.

- Corrected authenticated browser regression tests to target the CPM income field explicitly and verify logout removes signed-in account data without assuming all baseline table inputs disappear.

- Hardened staging PostgreSQL default privileges for objects created by the `postgres` migration role in the exposed `public` schema. New tables, sequences, and functions no longer grant access to client roles by default; new functions no longer inherit PUBLIC EXECUTE. Existing table grants, row policies, and budget records are unchanged. Added migration and regression coverage.

- Improved live staging integration setup diagnostics to identify the failing stage and safe HTTP status/code without logging credentials, tokens, or response payloads.

- Added a desktop-only Back to Overview control to the Recurring Rules Manager and fixed Auto-Cascade label contrast in the dark header; retained the mobile sidebar navigation and added desktop/mobile regression assertions.

- Added a branded staging password-reset page, routed Forgot Password emails to it, validated recovery sessions before password updates, and added desktop/mobile regression coverage.
- Added a branded staging email-confirmation page, routed new signups to it, and added desktop/mobile coverage for successful, invalid, and expired confirmation links.

- Aligned authenticated staging API and browser integration tests with the current redesigned dashboard and `budget_ui_years` storage table; legacy Release 2 `budget_data` remains untouched.
- Removed the unused pinned production-repository checkout from the live staging workflow so builds and tests use the exact staging application revision.
- Replaced obsolete Release 2 browser assertions with coverage for authenticated cloud save/restore, account switching isolation, and logout clearing.
- Updated live-test documentation to state the reserved fixture years and current test scope.

- Added the Rolling Budget brand guidelines as the reference for logo construction, color palette, typography, and brand voice.
- Updated Sign In, Create Account, and Forgot Password dialogs with the official three-bar logo, clearer copy, inline feedback, and responsive controls.
- Moved Recurring Rules and Year Management into the mobile navigation sidebar and simplified the Settings view to account and cloud-sync access.
- Standardized mobile navigation and authentication touch targets; added desktop and mobile regression coverage for the new behavior.

- Removed the Recurring Rules Manager back button; users return to Overview, Plan, or Settings through the navigation menu. Kept navigation accessible while the manager is open.
- Added a dedicated Recurring Rules Manager with distinct desktop table and mobile card views.
- Added monthly, every-two-months, quarterly, every-six-months, and annual frequencies; removed the end-month field.
- Added enable/disable controls and regression coverage for frequency placement, legacy-rule safety, and mobile overflow.
