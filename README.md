# rollingbudget-staging

Isolated staging frontend for Rollover Budget Pro. Synthetic test data only; production remains in yollysmiley/rollingbudget.

## Brand standards

See [Rolling Budget Brand Guidelines](docs/BRAND_GUIDELINES.md) for the approved logo, colors, typography, authentication treatment, and responsive brand usage.

## Database security

The staging migration `20261114192802_harden_public_default_privileges.sql` restricts default grants for future objects created by the `postgres` migration role in the exposed `public` schema. New tables, sequences, and functions require explicit grants; new functions do not inherit PUBLIC EXECUTE. Existing access is not changed. See [the staging guide](STAGING.md#database-security) and [verification SQL](supabase/verification/verify-default-privileges.sql).

## Email confirmation

New staging signups redirect to the branded `auth-confirmation.html` page. See [staging setup](STAGING.md#email-confirmation) for the required Supabase Auth redirect allowlist entry.

## Password reset

The staging Forgot Password flow sends a recovery email to the branded `reset-password.html` page. The page validates the recovery session before allowing a password change. Add `https://yollysmiley.github.io/rollingbudget-staging/reset-password.html` to the staging Supabase Auth redirect allowlist; see [staging setup](STAGING.md#password-reset).
