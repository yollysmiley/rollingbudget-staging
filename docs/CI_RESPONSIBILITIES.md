# Rolling Budget — CI Responsibilities (Staging)

This document preserves the CI contract formerly described in README. For browser-test details see [browser acceptance tests](browser-tests.md).

## CI workflow responsibilities

| Workflow | Trigger | Responsibility |
| --- | --- | --- |
| `build-staging.yml` (`build`) | Pull requests, staging `main`, manual | Build staging assets, run unit/security regressions and desktop/mobile Playwright acceptance; publish Pages only from staging `main`. Superseded PR runs may be cancelled; main deployments are not cancelled. |
| `authenticated-test-validation.yml` (`validate`) | Pull requests, dedicated validation branch | Secret-free syntax checks and authenticated Playwright test discovery. The main build owns live safety unit-test execution to avoid redundant work. |
| `live-staging-tests.yml` (`integration`) | Staging `main`, manual | Credential-protected Supabase authentication, RLS, and browser persistence checks using dedicated test users. It intentionally revalidates its own prerequisites for independently triggered runs. Manual runs are permitted only on staging `main`; the protected `staging-live-tests` environment still controls secret access. Never expose its secrets to pull-request jobs. |

Keep the required `build` and `validate` status checks stable when changing CI. Browser failure reports are retained for seven days; successful runs do not upload those reports. The built staging frontend remains available as a short-lived artifact. Live tests seed only modern `amount`/`accountId` income and a run-scoped account; dedicated unit/browser regressions test historical CPM/USAA migration separately. Cleanup must verify test-run ownership before deleting fixture records.

**Reproducible installs:** `package-lock.json` is committed. All three workflows use `npm ci` and `actions/setup-node` npm caching keyed to the lockfile; the credentialed live workflow and secret-free validation retain `--ignore-scripts`. The cache contains npm download artifacts, not browser sessions or authenticated data.
