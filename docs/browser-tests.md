# Browser acceptance tests

The staging build runs Node unit/security/contract regressions and Playwright desktop and mobile Chromium suites against a freshly built local `dist/` site. The suites live in `tests/browser/budget.spec.js` (desktop) and `tests/browser/mobile.spec.js` (mobile). Test counts must be obtained from the current Playwright `--list` output rather than historical fixed totals.

Browser fixtures mock or block Supabase requests; these tests validate UI behavior, not real Supabase authorization or persistence. The protected `live-staging-tests.yml` workflow separately runs real staging authentication, owner isolation, persistence, and authenticated desktop acceptance. A corresponding credentialed mobile acceptance suite is not yet a release gate.

Run locally: `npm ci`, `npx playwright install chromium`, `node scripts/build-staging.mjs`, `node --test tests/*.test.mjs tests/live/*.test.mjs`, and `npm run test:e2e`. Python 3 is required for the Playwright local server. CI retains browser failure artifacts for seven days.

Mobile Playwright uses Chromium device emulation; it does not validate iOS Safari. Before production promotion, manually smoke-test sign-in/sign-out, Overview/Plan/Recurring Rules/Settings navigation, account isolation, expense-category changes, and cloud reload on a real mobile browser. Record device, browser, commit, result and issues.

## Recurring Rules Manager coverage

The recurring-rules manager has separate desktop table and mobile card layouts. Browser coverage verifies frequency-based month placement, disabling newly generated entries, preserving legacy manually stored budget entries when a legacy rule is disabled, mobile layout visibility, and narrow-viewport overflow.


## Recurring manager navigation regression

Desktop and mobile browser tests verify the manager has no Back to budget control and the app header remains visible. Mobile acceptance coverage opens the manager and navigates to Plan, Settings, and Overview through the sidebar without a page refresh.


## Email confirmation page

The confirmation page is built as a separate static route and tested on desktop and mobile Chromium. Browser tests stub the Supabase client to cover successful session detection and invalid or expired links without contacting the staging Auth API or creating real users. Live email delivery and a real inbox confirmation still require a staging smoke test.
