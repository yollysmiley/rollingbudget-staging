# Changelog

## Unreleased

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
