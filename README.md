# rollingbudget-staging
Isolated staging frontend for Rollover Budget Pro. Synthetic test data only; production remains in yollysmiley/rollingbudget.

## Brand standards

See [Rolling Budget Brand Guidelines](docs/BRAND_GUIDELINES.md) for the approved logo, colors, typography, authentication treatment, and responsive brand usage.

## Email confirmation

New staging signups redirect to the branded `auth-confirmation.html` page. See [staging setup](STAGING.md#email-confirmation) for the required Supabase Auth redirect allowlist entry.

## Password reset

The staging Forgot Password flow sends a recovery email to the branded `reset-password.html` page. The page validates the recovery session before allowing a password change. Add `https://yollysmiley.github.io/rollingbudget-staging/reset-password.html` to the staging Supabase Auth redirect allowlist; see [staging setup](STAGING.md#password-reset).
