# Staging frontend configuration

Backend: rollingbudget-staging (`phiscfwfuzeptetimdbo`). Production is not a build target. The publishable key in `staging-config.json` is browser-safe; never substitute a service-role or secret key.

## Application source and deployment

The redesigned application source is `rollover-budget-app.html` in this repository. `scripts/build-staging.mjs` reads that file directly, injects only the staging Supabase URL, publishable key and storage namespace, adds a visible staging banner, and writes the static site to `dist/`. The workflow does not check out or build the pinned production application repository.

GitHub Pages is enabled with GitHub Actions as the source. Pull requests build and test only; deployment occurs from `main`. The staging site is https://yollysmiley.github.io/rollingbudget-staging/.

## Data separation

The redesigned UI stores browser data under the account-specific `rollingbudget_staging_phiscfwfuzeptetimdbo_<user-or-guest>_budget_<year>` namespace and uses an isolated Supabase auth storage key.

Legacy Release 2 records remain in `public.budget_data`. The redesigned UI does not read, overwrite, delete, or automatically migrate those records. New UI cloud records use the separate `public.budget_ui_years` table. The migration `20261114184318_create_budget_ui_years.sql` must be applied to the staging Supabase project before authenticated cloud sync is available. Until it is applied, browser-local saving continues and cloud errors are logged; no legacy table is modified.

No production budget records, browser backups, credentials, or policies are copied. Staging uses synthetic data only.

## Database security

The staging migration `20261114192802_harden_public_default_privileges.sql` restricts default table, sequence, and function grants for objects created by the `postgres` migration role in the exposed `public` schema. Future objects require explicit grants to client roles, and newly created functions do not inherit PUBLIC EXECUTE. Existing object grants and row-level policies are unchanged. The migration does not change budget rows or either budget table.

The staging project has owner-scoped SELECT, INSERT, UPDATE, and DELETE policies on both `budget_data` and `budget_ui_years`. UPDATE policies include both USING and WITH CHECK. Verify the applied defaults and effective table grants with [verify-default-privileges.sql](supabase/verification/verify-default-privileges.sql).

## Validation

The browser acceptance suite in `tests/browser/budget.spec.js` targets the redesigned UI. Previous Release 2 security and cross-account test evidence applies to the previous application and is not evidence that the redesigned UI has passed equivalent live cloud tests. Run the new UI's browser suite and verify the migration and authenticated cloud sync in the staging project before relying on cloud persistence.

## Local build

With Node.js 24:

```sh
npm install --no-audit --no-fund
node scripts/build-staging.mjs
python3 -m http.server 4173 --directory dist
```

Use synthetic budgets only. The build is not a security boundary against malicious code.

## Email confirmation

New signups explicitly redirect to `https://yollysmiley.github.io/rollingbudget-staging/auth-confirmation.html`. The confirmation page uses the staging Supabase project and the same isolated auth storage key as the app; it handles successful confirmation and invalid or expired links. In the staging Supabase dashboard, add that exact URL under **Authentication → URL Configuration → Redirect URLs**. Keep the Site URL and redirect allowlist scoped to staging; do not add production destinations to the staging project. The email template should continue using Supabase's confirmation URL (`{{ .ConfirmationURL }}`), so the `emailRedirectTo` supplied at signup is honored.

## Password reset

The public homepage Forgot Password button opens an email-only mode in the branded account dialog. Submitting requests a Supabase recovery email; the dedicated reset page is only opened from a recovery callback, not directly from the homepage.

The Forgot Password action sends a recovery email with `redirectTo` set to `https://yollysmiley.github.io/rollingbudget-staging/reset-password.html`. The page uses the staging Supabase project and the same isolated auth storage key as the app. It waits for a verified `PASSWORD_RECOVERY` callback instead of treating a pending callback as an expired link, and supports recovery `token_hash` callbacks via `verifyOtp`. It validates password length and confirmation and updates the authenticated user through `auth.updateUser()`. A recovery callback that never completes is rejected after a bounded wait.

In the staging Supabase dashboard, add that exact URL under **Authentication → URL Configuration → Redirect URLs**. Keep the Site URL and redirect allowlist scoped to staging; do not add production destinations to the staging project. The Supabase connector available to this workflow does not expose Auth URL configuration, so this allowlist entry must be added in the staging dashboard.
