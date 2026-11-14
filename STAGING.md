# Staging frontend configuration

Backend: rollingbudget-staging (`phiscfwfuzeptetimdbo`). Production is not a build target. The publishable key in `staging-config.json` is browser-safe; never substitute a service-role or secret key.

## Application source and deployment

The redesigned application source is `rollover-budget-app.html` in this repository. `scripts/build-staging.mjs` reads that file directly, injects only the staging Supabase URL, publishable key and storage namespace, adds a visible staging banner, and writes the static site to `dist/`. The workflow does not check out or build the pinned production application repository.

GitHub Pages is enabled with GitHub Actions as the source. Pull requests build and test only; deployment occurs from `main`. The staging site is https://yollysmiley.github.io/rollingbudget-staging/.

## Data separation

The redesigned UI stores browser data under the account-specific `rollingbudget_staging_phiscfwfuzeptetimdbo_<user-or-guest>_budget_<year>` namespace and uses an isolated Supabase auth storage key.

Legacy Release 2 records remain in `public.budget_data`. The redesigned UI does not read, overwrite, delete, or automatically migrate those records. New UI cloud records use the separate `public.budget_ui_years` table. The migration `20261113010000_create_budget_ui_years.sql` must be applied to the staging Supabase project before authenticated cloud sync is available. Until it is applied, browser-local saving continues and cloud errors are logged; no legacy table is modified.

No production budget records, browser backups, credentials, or policies are copied. Staging uses synthetic data only.

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
