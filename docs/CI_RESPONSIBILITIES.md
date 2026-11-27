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

## PR #98 Phase 3C — change-aware build gate

The required build job always runs. On pull requests only, it clears .ci-trusted, checks out the immutable pull_request.base.sha separately with persisted credentials disabled, and verifies that directory's Git HEAD matches the expected base SHA. It runs the resolver and classifier from that trusted base, never from the PR head. If either script is absent (including PR #98 before merging), checkout fails, or the SHA differs, the mode remains full.

The trusted resolver uses a read-only GitHub token to enumerate every PR changed file across pages of 100 and requires the returned count to exactly equal GitHub's pull_request.changed_files. It rejects missing metadata, inconsistent pages, API failures and changes exceeding the 3,000-file API limit. The existing exact allowlist permits only modified documentation files to use lightweight mode. Unknown, mixed, renamed, added or removed changes always use full mode.

For justified lightweight PRs, the build check succeeds only after trusted classification and records the exemption in its job summary. Node dependencies, browser setup, unit/security/rendering tests, synthetic backup/restore regression, desktop/mobile acceptance and frontend artifact upload run in full mode. All main pushes and manual dispatches always use full mode; Pages packaging and deployment remain main-only. The PostgreSQL workflow is unchanged in this increment, as are protected credentialed integration and authorized backup boundaries. A successful lightweight check is not evidence that full regression testing executed.

Local validation before this increment: six resolver regression tests, two workflow gate regression tests, Node syntax checks, and YAML parsing passed in an isolated test directory. A full repository checkout is not available locally; the complete Node, desktop/mobile and PostgreSQL suites require GitHub Actions for the new commit.

## PR #98 Phase 3D — PostgreSQL required gate

The classify job reuses the trusted-base resolution steps from build. The database job provisions PostgreSQL 17 only when the decision is not lightweight. The always-running postgres-contracts reporting job requires successful classification and either successful database execution or an explicit lightweight decision with the database job skipped. Failure, cancellation and unexpected skips cannot pass. Existing database assertions, order, synthetic credentials and main/manual full validation are unchanged. Local shell validation exercised all 64 combinations of mode, classification and database outcomes; full repository validation is pending CI. No live credentials are introduced.

## Phase 3E corrective policy

Immutable Git merge parents and both PR and merge diffs replace mutable API pagination. Only regular non-executable file modifications qualify. Missing revisions require full validation. Require independent review of workflow and classifier changes through repository rules/CODEOWNERS; trusted-base code alone cannot protect a PR-controlled workflow. Branch protection and actual lightweight execution remain unverified. The earlier Phase 3D local outcome-count claim was not independently evidenced.
