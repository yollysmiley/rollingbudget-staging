# Release 1 validation evidence — staging

Environment: `rollingbudget-staging` (Supabase project `phiscfwfuzeptetimdbo`), frontend at https://yollysmiley.github.io/rollingbudget-staging/. All testing used synthetic data. Production was not queried or modified.

## Safe rendering (P0 item 1)

Fix: PR #1 (`e9f276a`), merged to staging `main` and deployed via GitHub Pages.

Browser regression run (2026-10-30, cloud browser against the deployed site):

| Area | Result |
|---|---|
| Paycheck name with `<img onerror>` / `<script>` / `<b>` payloads | Rendered as literal text; no injected elements; no execution |
| Expense name and category payloads | Literal text / contained in input values; no `javascript:` links |
| Excluded-bucket name and note payloads | Literal text; no execution |
| Bucket dropdown options | Literal option text |
| Recurring bill name/category; recurring-selection modal | Contained in input values; modal rendered names as literal text |
| Avatar URL validation (`rbAvatarUrl`) | `javascript:`, `data:`, `http:`, and credentialed URLs rejected; clean HTTPS accepted |
| Inline event handlers on page | 17 found, all static app buttons with fixed strings; none user-derived |
| Console errors / unhandled rejections | None |
| Rollover recalculation | $2,500 → $2,400 with $100 expense → $2,500 after removal |

Coverage gaps: profile display name/email rendering not exercised (no staging sign-in during rendering tests); mobile viewport not part of the rendering run.

## Supabase RLS isolation (P0 item 2)

Live policy/grant inspection (2026-10-29/30): RLS enabled; four ownership policies on SELECT/INSERT/UPDATE/DELETE restricted to `user_id = auth.uid()`; authenticated granted only the four row operations; anon/public granted nothing; no TRUNCATE/REFERENCES/TRIGGER.

Functional cross-account matrix (2026-10-30, ordinary REST API sessions — anon key plus user JWTs, two synthetic accounts):

| Test | Result |
|---|---|
| A upsert/read/update own budget | Allowed |
| B upsert/read/delete own budget | Allowed |
| B read A's budget | Denied (empty result) |
| B update A's budget | Denied (0 rows affected; data verified intact) |
| B delete A's budget | Denied (0 rows affected; row survived) |
| B insert row owned by A | Rejected, HTTP 403 RLS violation |
| A transfer own budget to B | Rejected, HTTP 403 RLS violation |
| A read B's budget | Denied (empty result) |
| Anonymous select/insert | Denied, HTTP 401 permission denied |

Synthetic test users created for this matrix: `rls-test-a@example.com`, `rls-test-b@example.com` (staging only). Table returned to 0 rows after cleanup.

## Deployment

- Pages source: GitHub Actions (user-enabled).
- Workflow `build-staging.yml`: build + deploy on `main`; PRs build only.
- Deployed-code check (browser console, 2026-10-30): staging project reference present, replacement renderer functions present, no legacy `innerHTML`/`outerHTML`/`insertAdjacentHTML` sinks in served HTML.

## Known deferred defects

- Mobile horizontal overflow: 289px of overflow at a 390px viewport (re-confirmed 2026-10-30 after the safe-rendering deploy). Deferred by the user; not fixed by Release 1.

## Outstanding before production rollout

- Production database backup created, preserved privately, and recovery demonstrated.
- Browser-backup restore test in an isolated, cloud-disabled environment.
- Production grant tightening (including client `TRUNCATE`) requires a separately approved production change.
