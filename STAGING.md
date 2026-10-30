# Staging frontend configuration

Backend: rollingbudget-staging (phiscfwfuzeptetimdbo). Production is not a build target. The publishable key in staging-config.json is browser-safe; never substitute a service-role or secret key.

The build workflow checks out application source at 3c9277bb5dd3209c603a8fd1e952583970136385 and transforms only its environment configuration, storage keys, title, and staging banner. Source transform mismatches fail the build. No production budget records or browser backups are copied.

Budget, legacy fallback, theme, and Supabase authentication storage use a staging-specific prefix. This is important because separate GitHub Pages repository paths can share the same origin. No production storage keys are read by the generated application.

## Deployment

GitHub Pages is enabled with GitHub Actions as the source. The workflow builds and deploys on `main` (PRs build only). The live site is https://yollysmiley.github.io/rollingbudget-staging/.

## Database

The staging schema is applied migration `20261029194718_create_staging_budget_data` (see `supabase/migrations/`), with verification queries in `supabase/verification/`. It uses tightened client grants and four ownership RLS policies. Two synthetic test accounts exist for isolation testing; staging uses synthetic data only.

## Validation status

Release 1 validation evidence, including the safe-rendering browser regression run and the cross-account RLS isolation matrix, is recorded in `docs/release1-validation.md`. Both P0 security items have passing functional evidence in staging. The deferred mobile horizontal overflow (289px at 390px viewport) remains open.

## Local build

For a local build with Node.js 24, obtain the pinned source revision in a separate local checkout, then run:

```sh
node scripts/build-staging.mjs /path/to/pinned/rollover-budget-app.html
```

Serve dist using a local static server. Use synthetic budgets only. This build is not a security boundary against malicious code.

## Remaining gates

- Production database backup and demonstrated recovery.
- Browser-backup restore test in an isolated, cloud-disabled environment.
- Production grant tightening (including client TRUNCATE) via a separately approved change.
- Do not use production authentication credentials or copy production user data.
