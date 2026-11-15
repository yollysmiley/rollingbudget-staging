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
| `live-staging-tests.yml` (`integration`) | Staging `main`, manual | Credential-protected Supabase authentication, RLS, and browser persistence checks using dedicated test users. It intentionally revalidates its own prerequisites for independently triggered runs. Manual runs are permitted only on staging `main`; the protected `staging-live-tests` environment still controls secret access. Never expose its secrets to pull-request jobs. |

Keep the required `build` and `validate` status checks stable when changing CI. Browser failure reports are retained for seven days; successful runs do not upload those reports. The built staging frontend remains available as a short-lived artifact. Live tests seed only modern `amount`/`accountId` income and a run-scoped account; dedicated unit/browser regressions test historical CPM/USAA migration separately. Cleanup must verify test-run ownership before deleting fixture records.

**Reproducible installs:** `package-lock.json` is committed. All three workflows use `npm ci` and `actions/setup-node` npm caching keyed to the lockfile; the credentialed live workflow and secret-free validation retain `--ignore-scripts`. The cache contains npm download artifacts, not browser sessions or authenticated data.

## Staging redesign — Phase 1

The shared brand stylesheet is `styles/brand.css`; the staging build publishes it under both public and authenticated routes. Desktop and mobile navigation remain separate while using the same budget state. See [brand standards](docs/BRAND_GUIDELINES.md) and [staging configuration](STAGING.md).

## Recurring rules (staging)

The authenticated **Recurring Rules Manager** is available from the main desktop navigation or the mobile sidebar. Rules are shared across budget years. Each rule has a required Start date, an optional End date, and a frequency. Missing occurrences are added automatically to saved, eligible cloud budget years. New budget years receive applicable rules after their first successful cloud save.

Editing amounts or frequency, disabling, and re-enabling rules take effect from the next eligible calendar month. Saved transactions, including previously generated future entries and manual adjustments, are never overwritten or deleted. Consequently, previously generated entries retain their earlier amount even when a rule changes.

Each desktop/mobile manager displays synchronization results and warns about possible duplicate transactions that were skipped. **Retry synchronization** appears when cloud synchronization is incomplete. It re-reads the owner-scoped cloud budget and preserves optimistic revision and local-conflict checks; it does not automatically resolve conflicts or approve possible duplicates. Pending retry ranges are kept within the browser tab session. Resolve a flagged cloud conflict with the existing budget reconciliation controls before retrying.

The PR build uses isolated Playwright Supabase mocks; the credentialed live staging workflow is restricted to staging `main`, so live authenticated recurring-rule persistence must be independently verified before approving a release.

Budget year selection is available directly above the authenticated budget on desktop and mobile. The current year plus two future years are automatically selectable without creating empty cloud records. Older saved years remain available; unsynced local years are retained for explicit recovery. The Settings menu no longer contains a Budget Years section. A future year is saved on its first edit, after which existing global recurring rules are applied to that saved year.

In an empty future budget year, the desktop and mobile budget views offer **Copy Previous Year’s Plan** when the preceding year has manual planned entries. Confirmation is required. The action copies planned categories and amounts without recurring-generated entries or historical debt balances, and it never overwrites existing entries. Cloud sync follows the existing save-on-demand path.
