# Authenticated desktop acceptance

The authenticated browser suite is written for the current staging dashboard in `rollover-budget-app.html`, not the separate legacy Release 2 interface. It uses the `budget_ui_years` table and the same two dedicated staging password sessions as the API ownership suite.

Coverage includes cloud save and fresh-context restore, account A/B switching without cross-account budget display, and UI logout clearing the signed-in budget before another account is loaded. Fixtures are created only in the reserved 2026 year after confirming it is empty for both test accounts, tagged with a unique run marker, and removed only after the marker and owner are verified.

The browser test workflow runs Chromium on desktop. Guest desktop and mobile UI regression tests remain in the separate browser workflow. These authenticated cases do not claim to cover GitHub OAuth redirects, MFA, expired-token recovery, cross-tab synchronization, or legacy Release 2 data behavior.

No production app, production Supabase project, admin key, or production data is used.
