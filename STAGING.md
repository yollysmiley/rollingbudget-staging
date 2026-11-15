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

## Phase 1 navigation and brand foundation

`styles/brand.css` is copied by `scripts/build-staging.mjs` to both public and authenticated staging routes. Desktop primary navigation follows Overview, Plan, Recurring Rules, Settings, with anchored Settings sections. Mobile retains a separate hamburger navigation and displays year/rollover controls on its Settings page. Budget storage and authentication remain unchanged. Phase 1 is a navigation foundation; the full reference-based page redesigns are separate phases.

## Phase 2 public homepage and authentication

The public landing page uses `styles/homepage.css` and a split hero with a budget illustration and feature cards, based on the approved homepage reference. The staging build copies the stylesheet to `dist/styles/homepage.css`. Authentication continues to use the existing Supabase modal handlers and confirmation/recovery redirect pages. The authenticated budget remains at `/app/`, with desktop and mobile app views unchanged. Tests: `tests/homepage-phase2.test.mjs` and `tests/browser/homepage.spec.js`.

## Phase 3A — Settings presentation separation

Desktop Settings keeps its existing section navigation and controls. Mobile Settings now has independent year selection, year creation, and auto-cascade controls rather than moving desktop DOM nodes between responsive views. Both views use the existing `activeYear`, `db`, `switchYear`, `createNewYear`, and auto-cascade persistence logic. `styles/settings.css` is scoped to the Settings views and copied to `dist/app/styles/settings.css` by the staging build. Tests: `tests/settings-phase3a.test.mjs` and `tests/browser/mobile.spec.js`. Account exclusion calculations, year cloning, and profile/security functionality remain for Phases 3B–3D; this PR does not change those contracts.

### Phase 3A navigation revision

The desktop header now exposes one **Budget** destination instead of separate Overview and Plan buttons. Desktop Settings uses four mutually exclusive submenu screens selected by sidebar buttons, rather than anchor scrolling. Mobile retains Overview and Plan in its navigation but Settings now opens a four-option menu; each option opens a dedicated detail screen with **Back to Settings**. Tests: `tests/desktop-settings-navigation.test.mjs`, `tests/browser/settings-navigation.spec.js`, and `tests/browser/mobile.spec.js`.


## Phase 3B — Account inclusion in budget totals and homepage navigation

The Accounts Manager exposes **Include in budget totals** for each account. Excluded income, expenses, credit-card payments, and loan payments do not contribute to monthly totals, pre-15 outflow, or subsequent auto-cascade rollover. Source entries remain intact, and re-including an account restores its contribution. Unassigned entries remain included. Account inclusion is persisted through the existing `budget_accounts.included` field; no schema migration is needed. Account-based computation is used even when no named accounts exist, so unassigned amount-based income remains visible.

The public homepage header labels are **Login** and **Sign Up** and remain grouped at the right on mobile. The hero keeps **Get started** and removes the duplicate sign-in action. The authenticated budget navigation and authentication behavior are unchanged. Validation includes account calculation unit tests, desktop/mobile budget browser coverage, and responsive homepage tests.

New-user browser fixtures begin with no accounts, and the desktop/mobile Accounts Manager must show the empty state. Historical CPM/USAA account fixtures are enabled only in explicitly marked legacy migration tests; no named account is created for a new user by default.

## Phase 4A — Recurring rule foundation (staging only)

The additive `budget_recurring_rules` migration defines owner-scoped, RLS-protected recurring rule storage. The table migration was applied and owner-scoped RLS verified in the isolated staging Supabase project. Existing `budget_ui_years` documents and generated budget entries are not modified.

`scripts/recurring-foundation.mjs` converts year-scoped legacy rules into dated definitions with deterministic migration identifiers and initial effective-dated versions. `scripts/recurring-storage.mjs` exposes an **explicit** idempotent import routine; it is deliberately not invoked by the app until the Phase 4B scheduling and historical-deduplication strategy is implemented. The import requires a verified complete year manifest. Rules without stable IDs or with repeated IDs across historical years are deliberately blocked pending explicit reconciliation; this prevents silent duplication, and the migration must not be enabled until those cases are resolved. Year-scoped rules remain the live source of truth in Phase 4A. No automatic cross-year generation, rule editing, or UI behavior changes are part of this phase.

Regression coverage: `tests/recurring-foundation.test.mjs`, plus the existing desktop/mobile recurring-rule and account tests. Staging schema and simulated authenticated cross-user RLS checks passed. Historical migration is not activated. Existing desktop/mobile behavior is unchanged.

### Phase 4B historical reconciliation (draft PR #39)

The read-only `inspectRecurringHistory(years, manifest)` preflight requires a verified complete year listing. It reports missing, duplicate, cross-year reused, and numeric legacy IDs without changing budgets or writing to Supabase. Numeric IDs are blocked until explicit normalization is implemented; reused IDs require explicit reconciliation. The scheduler is not connected to budget loading or migration yet. Do not enable automatic migration or merge PR #39 until the remaining integration work and regression checks pass.

### Phase 4B.3 reconciled storage bridge

`migrateReconciledRecurringRules(client, userId, years, manifest, decisions)` is an opt-in API, not invoked by the app. The caller must provide the authenticated user, a verified complete year history, and explicit per-year source-ID mappings using JSON-encoded `[year,sourceId]` keys. Cross-year merged identities, missing IDs, duplicate IDs, incomplete history, and invalid rule definitions block all writes. The bridge preserves original year documents and historical transactions, and upserts only new user-owned recurring definitions with `ignoreDuplicates`. Its `attempted` count is not an inserted-row count. Existing source-identity uniqueness constraints may reject conflicting mappings, which must be resolved rather than bypassed. Do not enable automatic migration until end-to-end verification is complete.

### Phase 4B.4 authenticated recurring preview

The authenticated app now loads owner-scoped definitions through `scripts/recurring-app-service.mjs` after budget years load and shows a read-only occurrence preview in the desktop and mobile Recurring Rules Manager. Imported historical rules (`source_year` set) remain held for reconciliation. The preview does not write budget transactions, alter totals, or enable automatic migration. Failed loads show an unavailable status rather than generating entries. Browser and unit regression tests cover the new preview surface. Full CI must pass before any merge.
