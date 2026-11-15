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

Phase A1 (rolling budget years, staging): the current calendar year and two future years are selectable from distinct desktop/mobile budget selectors, not Settings. All older saved cloud years and owner-scoped local-only/unsynced years remain discoverable, and selecting an empty future year does not create a database row. Changes to a virtual year save on first edit; that first successful cloud insert triggers the existing global recurring-rule backfill. A local/cloud divergence retains its local snapshot and marks the year for explicit reconciliation. The selected year is retained for the signed-in account within the browser session. Year cloning, complete revision tracking and richer conflict-resolution UI are deferred to later Phase A PRs. `scripts/year-discovery.mjs` is copied into both staging dist module locations; tests include `tests/year-discovery.test.mjs`, desktop/mobile/browser and cloud-save regressions.

### Phase 3A navigation revision

The desktop header now exposes one **Budget** destination instead of separate Overview and Plan buttons. Desktop Settings uses four mutually exclusive submenu screens selected by sidebar buttons, rather than anchor scrolling. Mobile retains Overview and Plan in its navigation but Settings now opens a four-option menu; each option opens a dedicated detail screen with **Back to Settings**. Tests: `tests/desktop-settings-navigation.test.mjs`, `tests/browser/settings-navigation.spec.js`, and `tests/browser/mobile.spec.js`.


## Phase 3B — Account inclusion in budget totals and homepage navigation

The Accounts Manager exposes **Include in budget totals** for each account. Excluded income, expenses, credit-card payments, and loan payments do not contribute to monthly totals, pre-15 outflow, or subsequent auto-cascade rollover. Source entries remain intact, and re-including an account restores its contribution. Unassigned entries remain included. Account inclusion is persisted through the existing `budget_accounts.included` field; no schema migration is needed. Account-based computation is used even when no named accounts exist, so unassigned amount-based income remains visible.

The public homepage header labels are **Login** and **Sign Up** and remain grouped at the right on mobile. The hero keeps **Get started** and removes the duplicate sign-in action. The authenticated budget navigation and authentication behavior are unchanged. Validation includes account calculation unit tests, desktop/mobile budget browser coverage, and responsive homepage tests.

New-user browser fixtures begin with no accounts, and the desktop/mobile Accounts Manager must show the empty state. Historical CPM/USAA account fixtures are enabled only in explicitly marked legacy migration tests; no named account is created for a new user by default.

## Shared recurring rules (PR #39)

The staging `budget_recurring_rules` table stores owner-scoped, RLS-protected recurring definitions. Both desktop and mobile managers use the same authenticated service. The legacy year-scoped rule definitions are not imported; existing historical budget transactions are retained. Obsolete migration helpers have been retired.

The scheduler uses stable occurrence IDs, original-month frequency anchoring and effective-dated rule changes. Cloud writes use conditional revisions for recurring rules, recurring application and ordinary budget saves; conflicting changes are rejected instead of overwriting newer cloud records. Local changes remain available for reconciliation after a rejected cloud save.

Potential duplicates across all categories are classified by normalized transaction names, including cases with changed amounts or accounts. Existing occurrence IDs are never recreated. Untagged possible duplicates are skipped by default, with a separate explicit review prompt for every ambiguous occurrence before the final Apply confirmation. No existing budget transaction is deleted or overwritten. Heuristic matching cannot guarantee detection of unrelated renamed transactions.

Regression coverage includes recurring service and scheduler unit tests, preview classification and individual approval tests, cloud conflict tests, desktop/mobile browser acceptance, and clean-account fixtures. Required staging CI must pass before merge. Production is unchanged.

## Final review hardening

Recurring-rule deletion is guarded by an owner-scoped versions compare-and-swap, matching effective-dated edits. Duplicate review uses exact normalized names, distinctive leading names, or substantive shared terms with matching amount and account, avoiding prompts from generic shared words alone. Desktop and mobile browser regression tests cover unresolved cloud conflicts, reload persistence, and explicit cloud recovery. Unit tests cover repeated stale saves and concurrent rule edit/delete rejection. Browser doubles enforce owner identity; live Supabase/RLS integration validation remains necessary before production promotion.
