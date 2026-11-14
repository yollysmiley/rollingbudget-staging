# Live staging auth and database tests

The live workflow tests the current staging application from this repository. The UI stores each year in `public.budget_ui_years`; it does not use the legacy Release 2 `public.budget_data` table. The two tables remain separate and no migration or import is performed by these tests.

## One-time setup

Create GitHub environment `staging-live-tests` with required reviewer approval and restrict deployment branches to `main`. Add environment secrets `STAGING_PUBLISHABLE_KEY`, `STAGING_TEST_A_EMAIL`, `STAGING_TEST_A_PASSWORD`, `STAGING_TEST_B_EMAIL`, and `STAGING_TEST_B_PASSWORD`. Use two dedicated staging Supabase users with password sign-in enabled and confirmed test emails. Never paste passwords into chat.

The API ownership test reserves year 2199 for synthetic fixtures. Both test accounts must have no row for year 2199. The browser acceptance tests use year 2026, which must also be empty for both dedicated accounts. Existing records are checked before fixture creation; the tests fail rather than overwrite them. Do not use these accounts for normal manual testing while the workflow is running.

## What is tested

- Real password authentication and refresh using ordinary user sessions and the staging publishable key.
- Row-level security on `budget_ui_years`: each account can read/update its own year, cannot read/update/delete the other account's row, cannot insert for another owner, and cannot change row ownership.
- Anonymous access is denied.
- The current staging UI can save an authenticated budget to the cloud and restore it in a fresh browser context.
- Switching between the two accounts loads only the selected account's budget.
- Signing out clears the signed-in budget view before another account is loaded.

The legacy `budget_data` table is intentionally not used by this UI acceptance suite. Its schema and records remain untouched.

## Run and safety

After review and merge to `main`, open Actions > Live staging auth and database tests > Run workflow, select `main`, then approve the protected environment. Pushes to `main` also run the workflow. Do not run credentialed code from an untrusted branch.

Fixtures are inserted only into the reserved years and are tagged with a unique integration-run marker. Cleanup deletes only the exact test user's reserved year after verifying that marker. If cleanup fails or a runner is interrupted, inspect those exact year rows before rerunning. No admin key, traces, screenshots, videos, auth-state files, or downloaded user data are uploaded.

This workflow is staging-only. It does not change production configuration, users, provider settings, database policies, or existing budget records.
