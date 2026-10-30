# Browser acceptance tests

The build workflow runs existing Node regression tests and eight Playwright tests on desktop and mobile Chromium (16 browser cases). Tests target the freshly generated dist build on localhost, never production or the previously deployed site. Fresh guest contexts create their own synthetic records. Supabase auth and REST requests are blocked, so live OAuth, cloud sync and RLS are not validated. Initialization is awaited explicitly.

Pull requests and the ci/staging-browser-tests branch run tests without deployment. On main, deployment requires all build and test steps to succeed. Failed browser tests retain HTML reports, traces and screenshots for seven days. This workflow does not configure branch protection. An existing stale-summary bug may fail the immediate-summary assertion; do not weaken it to hide a defect.

Local usage: npm install; npx playwright install chromium; build dist with the pinned upstream source using scripts/build-staging.mjs; npm run test:e2e. Python 3 is required for the localhost server. Commit the generated package-lock.json and switch CI to npm ci after dependency resolution has been verified. The top-level Playwright dependency is pinned, but without a lockfile the full dependency tree is not locked. Tests are authored, not yet verified passing. Mobile Chromium emulation is not real iOS Safari validation.
