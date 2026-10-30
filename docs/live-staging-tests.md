# Live staging auth and database tests

Status: implemented, not executed. This workflow is separate from guest UI acceptance and can write synthetic records only to the hard-coded staging project phiscfwfuzeptetimdbo. No production connection or admin key is used.

## One-time setup
Create GitHub environment staging-live-tests with required reviewer approval and restrict deployment branches to main. Add environment secrets STAGING_PUBLISHABLE_KEY, STAGING_TEST_A_EMAIL, STAGING_TEST_A_PASSWORD, STAGING_TEST_B_EMAIL, STAGING_TEST_B_PASSWORD. Use two dedicated staging Supabase users with password sign-in enabled and confirmed test emails. Create these users through trusted staging administration, not production. Never paste passwords into chat. If email/password auth is intentionally disabled, do not enable it without a separate staging-only configuration decision.

Both users must have no budget rows at test start. Tests refuse to overwrite existing rows. Avoid concurrent manual use of these accounts. The workflow is manual-only, main-only, and serialized. Do not run untrusted PR code with these credentials. Configure GitHub environment restrictions before running. No traces, screenshots, or auth artifacts are uploaded by this live API workflow.

## Run
After review and merge to main, open Actions > Live staging auth and database tests > Run workflow, select main, then approve the environment. This is real authentication, refresh, CRUD and RLS testing with ordinary user tokens. The publishable key is not an admin key. Cross-user inserts and owner changes must return 401/403, not merely fail a unique/foreign-key constraint. Unauthorized updates/deletes may return successful empty arrays; tests also verify target-row integrity. Created fixture IDs are tracked and deleted in finally using the owner token. Interrupted runners can leave fixtures: inspect the two dedicated accounts, identify integrationRun-tagged records, and clean those exact records before rerunning.

## Explicit remaining coverage
These tests do NOT test GitHub OAuth redirects/consent, browser session injection, UI cloud save/reload, UI A/logout/B account switching, stale delayed results, failed logout, multi-tab behavior, or SQL policy migrations in a local Supabase instance. Password/API tests are not OAuth acceptance evidence. Keep the existing Supabase network blocks in the guest browser suite; a separate authenticated browser configuration will be required. Use disposable GitHub test identities for controlled OAuth smoke tests, never personal credentials or a GitHub PAT as a substitute for app OAuth. Session state must remain untracked and excluded from artifacts. Do not add test-only login controls to the deployed app.

No users, GitHub environment, secrets, auth provider settings, or database policies are created by this commit. Those are prerequisites, not completed setup.
