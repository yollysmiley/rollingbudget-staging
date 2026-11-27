# Rolling Budget — CI Responsibilities (Staging)

This document describes the workflows present in staging at the Phase 1 release baseline. See [browser acceptance tests](browser-tests.md) for browser coverage.

## Workflow ownership

| Workflow | Trigger | Responsibility |
| --- | --- | --- |
| `build-staging.yml` (`build`, `deploy`) | PR, staging `main`, manual; also `ci/staging-browser-tests` pushes | Node 24 build, unit/security tests, desktop/mobile Playwright acceptance, and staging Pages deployment from `main` only. Superseded PR runs may be cancelled; main deployments are preserved. |
| `staging-postgres-contracts.yml` (`postgres-contracts`) | PR, staging `main`, manual | Secret-free PostgreSQL 17 disposable database tests: populated upgrade, clean migration replay, owner isolation, recurring constraints and account deletion races. |
| `live-staging-tests.yml` (`integration`) | Staging `main` push or manual dispatch | Protected credentialed staging authentication, RLS, persistence and browser acceptance. The job permits staging `main` only, including manual `workflow_dispatch` runs. Manual dispatch from other branches is skipped. The `staging-live-tests` environment remains required. Verify GitHub environment branch restrictions and reviewer requirements separately; workflow code does not prove those settings. Never grant credentialed execution to arbitrary PR branches. |
| `logout-diagnostics.yml` (`diagnostics`) | Manual dispatch on staging `main` | Private logout troubleshooting, with encrypted short-retention traces. Diagnostic-only; not a general release gate. |

The previously documented `authenticated-test-validation.yml` / `validate` check is not present in this baseline. Do not assume a check is required or passing based on historical documentation. **Verify branch protection's actual required check names and recent GitHub Actions runs before changing protection rules or approving a release.**

## Test isolation and secrets

The PR build and PostgreSQL contract jobs use no live staging credentials. The live integration job uses the protected `staging-live-tests` environment and dedicated staging test users; it must never expose secrets to untrusted pull requests. Tests must create and clean up their own records, preserve owner isolation and avoid historical production data. Separate desktop/mobile browser regression coverage is required for navigation and settings changes.

The committed `package-lock.json` supports reproducible `npm ci` installs with npm caching. The live workflow uses `--ignore-scripts`; the main build uses `npm ci --no-audit --no-fund`. Keep build, database and credentialed integration responsibilities distinct.

## Release validation

Before staging is promoted, verify `build`, `postgres-contracts`, and protected `integration` results for the **same approved release commit** (or document an explicit tested equivalent). Check GitHub Pages deployment, branch protection, and production authentication redirects separately; this document is not evidence of those external settings.

## Phase 2C release gates

For the exact candidate SHA, verify successful main-branch build/deploy, PostgreSQL contracts, and protected live integration. Verify environment protection and required branch checks in GitHub Settings; workflow YAML alone cannot prove settings. Confirm staging Supabase migration history, effective owner-scoped RLS and security advisors; require the credentialed mobile Chromium smoke test to pass, record real-device mobile smoke testing, and verify a rollback plan. Do not infer CI success from a skipped job. **Premerge limitation:** PR checks cannot run the credentialed mobile smoke test because protected integration is restricted to staging `main`; after an explicitly approved staging merge, require successful protected integration on that exact commit before considering release promotion.

## Atomic validation increments

Prepare all related application, regression and documentation changes for an independently testable increment before publishing a branch update. When using GitHub's Git data API, create blobs and a tree based on the current head, create one commit with that head as parent, and advance the branch once without force. Do not publish intermediate file-by-file commits solely because the contents API permits them. Verify the branch head before publishing; reconcile concurrent changes rather than overwriting them. Keep separate commits for independently validated increments and corrective changes. Record the exact candidate SHA and wait for required CI results before advancing. Local validation remains required where available; any exception must be explicitly approved. Never use skip-CI markers to evade required checks.

## PR #98 Phase 2 audit baseline

At candidate 7a9b73251008fa815bb06aaa13d9f82dba46af94, build run 45925778747 and PostgreSQL run 45925778822 passed. Log elapsed times were approximately 159 and 23.5 seconds respectively. Build step intervals: Chromium setup 35.5 s, synthetic backup/restore 31.4 s, browser acceptance 74.1 s. Recent successful build workflow creation-to-update intervals were 167, 146 and 161 s; these include scheduling overhead. A recent failed build took 444 s; superseded PR runs were cancelled. These are observations, not performance guarantees.

The owner reported main protection requires build and validate; validate is retired. Recommended replacement is postgres-contracts. Direct protection read returned HTTP 403; the settings change is not independently verified. Preserve both active check names and never use workflow-level path filters that suppress required reporting.

The fifth workflow, authorized-staging-backup.yml, is manual, main-only, requires explicit BACKUP confirmation and the staging-backup environment, and uploads ciphertext and checksum only. Keep it separate. Preserve live integration and diagnostics credential boundaries. The legacy ci/staging-browser-tests push trigger remains unchanged pending verification of its consumers.

Phase 3 policy: initially allow only explicitly named documentation paths to qualify for reduced PR validation. Classify the entire PR diff, including old and new paths for renames; unknown, mixed, missing or failed classification requires full validation. Main pushes and manual runs always execute full validation. Keep database contracts intact when selected, and require explicit successful gate reporting for justified exemptions; never treat an unexpected skipped or failed test as success. Review tests/ci-workflows.test.mjs, tests/staging-backup.test.mjs, tests/live/current-ui-contract.test.mjs, both Playwright configurations, synthetic backup/restore scripts and PostgreSQL contracts when changing workflow execution. Add classifier and gate regressions before enabling exemptions. No application behavior or fixtures change in this documentation increment.
