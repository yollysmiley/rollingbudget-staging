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

For the exact candidate SHA, verify successful main-branch build/deploy, PostgreSQL contracts, and protected live integration. Verify environment protection and required branch checks in GitHub Settings; workflow YAML alone cannot prove settings. Confirm staging Supabase migration history, effective owner-scoped RLS and security advisors; require the credentialed mobile Chromium smoke test to pass, record real-device mobile smoke testing, and verify a rollback plan. Do not infer CI success from a skipped job.
