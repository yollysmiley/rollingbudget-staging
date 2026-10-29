# Staging frontend configuration

Backend: rollingbudget-staging (phiscfwfuzeptetimdbo). Production is not a build target. The publishable key in staging-config.json is browser-safe; never substitute a service-role or secret key.

The build workflow checks out application source at 3c9277bb5dd3209c603a8fd1e952583970136385 and transforms only its environment configuration, storage keys, title, and staging banner. Source transform mismatches fail the build. No production budget records or browser backups are copied.

Budget, legacy fallback, theme, and Supabase authentication storage use a staging-specific prefix. This is important because separate GitHub Pages repository paths can share the same origin. No production storage keys are read by the generated application.

The GitHub Actions workflow builds and uploads a staging-frontend artifact. It does not deploy or enable Pages. The artifact excludes the upstream checkout and configuration tooling. Build and browser execution are unverified until their runs are reviewed.

For a local build with Node.js 24, obtain the pinned source revision in a separate local checkout, then run:

```sh
node scripts/build-staging.mjs /path/to/pinned/rollover-budget-app.html
```

Serve dist using a local static server. Use synthetic budgets only. The generated app still contains the known application defects, including the deferred mobile overflow. This build is not a security boundary against malicious code and does not establish end-to-end isolation.

Pending gates: verify the generated artifact, add browser/network isolation tests for that artifact, configure Pages hosting, configure staging GitHub OAuth and explicit redirect URLs, and run ordinary-client account-isolation tests. Do not use production authentication credentials or copy production user data.
