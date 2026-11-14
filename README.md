# rollingbudget-staging

Isolated staging frontend for Rollover Budget Pro. Synthetic test data only; production remains in yollysmiley/rollingbudget.

## Brand standards

See [Rolling Budget Brand Guidelines](docs/BRAND_GUIDELINES.md) for the approved logo, colors, typography, authentication treatment, and responsive brand usage.

## Database security

The staging migration `20261114192802_harden_public_default_privileges.sql` restricts default grants for future objects created by the `postgres` migration role in the exposed `public` schema. New tables, sequences, and functions require explicit grants; new functions do not inherit PUBLIC EXECUTE. Existing access is not changed. See [the staging guide](STAGING.md#database-security) and [verification SQL](supabase/verification/verify-default-privileges.sql).

## Email confirmation

New staging signups redirect to the branded `auth-confirmation.html` page. See [staging setup](STAGING.md#email-confirmation) for the required Supabase Auth redirect allowlist entry.

## Password reset

The staging Forgot Password flow sends a recovery email to the branded `reset-password.html` page. The page validates the recovery session before allowing a password change. Add `https://yollysmiley.github.io/rollingbudget-staging/reset-password.html` to the staging Supabase Auth redirect allowlist; see [staging setup](STAGING.md#password-reset).

## Public homepage and protected app

The public staging homepage is `/rollingbudget-staging/`. The authenticated budgeting app is `/rollingbudget-staging/app/`. Signed-out visits to the app redirect to the homepage, and logout clears the displayed budget before redirecting. The legacy `/rollover-budget-app.html` is retained as an authenticated compatibility entry point. Supabase RLS remains the authorization boundary; the frontend guard is not a substitute for RLS.

## CI workflow responsibilities

| Workflow | Trigger | Responsibility |
| --- | --- | --- |
| `build-staging.yml` (`build`) | Pull requests, staging `main`, manual | Build staging assets, run unit/security regressions and desktop/mobile Playwright acceptance; publish Pages only from staging `main`. Superseded PR runs may be cancelled; main deployments are not cancelled. |
| `authenticated-test-validation.yml` (`validate`) | Pull requests, dedicated validation branch | Secret-free syntax checks and authenticated Playwright test discovery. The main build owns live safety unit-test execution to avoid redundant work. |
| `live-staging-tests.yml` (`integration`) | Staging `main`, manual | Credential-protected Supabase authentication, RLS, and browser persistence checks using dedicated test users. It intentionally revalidates its own prerequisites for independently triggered runs. Never expose its secrets to pull-request jobs. |

Keep the required `build` and `validate` status checks stable when changing CI. Browser failure reports are retained for seven days; successful runs do not upload those reports. The built staging frontend remains available as a short-lived artifact. Live tests seed only modern `amount`/`accountId` income and a run-scoped account; dedicated unit/browser regressions test historical CPM/USAA migration separately. Cleanup must verify test-run ownership before deleting fixture records.

**Reproducibility follow-up:** The repository currently has no committed `package-lock.json`. CI therefore uses `npm install` rather than `npm ci`, and dependency caching is deliberately not enabled. Add a registry-generated, reviewed lockfile first; then switch all three workflows to `npm ci` and enable `actions/setup-node` npm caching keyed to the lockfile. Do not create an unverified lockfile by hand.
