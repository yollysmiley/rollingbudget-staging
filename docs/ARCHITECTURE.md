# Rolling Budget — Application Architecture and Authentication (Staging)

This document preserves the staging application and authentication architecture formerly described in README. For deployment details see [STAGING](../STAGING.md).

## Database security

The staging migration `20261114192802_harden_public_default_privileges.sql` restricts default grants for future objects created by the `postgres` migration role in the exposed `public` schema. New tables, sequences, and functions require explicit grants; new functions do not inherit PUBLIC EXECUTE. Existing access is not changed. See [the staging guide](STAGING.md#database-security) and [verification SQL](supabase/verification/verify-default-privileges.sql).

## Email confirmation

New staging signups redirect to the branded `auth-confirmation.html` page. See [staging setup](STAGING.md#email-confirmation) for the required Supabase Auth redirect allowlist entry.

## Password reset

The staging Forgot Password flow sends a recovery email to the branded `reset-password.html` page. The page validates the recovery session before allowing a password change. Add `https://yollysmiley.github.io/rollingbudget-staging/reset-password.html` to the staging Supabase Auth redirect allowlist; see [staging setup](STAGING.md#password-reset).

## Public homepage and protected app

The public staging homepage is `/rollingbudget-staging/`. The authenticated budgeting app is `/rollingbudget-staging/app/`. Signed-out visits to the app redirect to the homepage, and logout clears the displayed budget before redirecting. The legacy `/rollover-budget-app.html` is retained as an authenticated compatibility entry point. Supabase RLS remains the authorization boundary; the frontend guard is not a substitute for RLS.

## Staging redesign — Phase 1

The shared brand stylesheet is `styles/brand.css`; the staging build publishes it under both public and authenticated routes. Desktop and mobile navigation remain separate while using the same budget state. See [brand standards](docs/BRAND_GUIDELINES.md) and [staging configuration](STAGING.md).
