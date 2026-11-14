# rollingbudget-staging
Isolated staging frontend for Rollover Budget Pro. Synthetic test data only; production remains in yollysmiley/rollingbudget.

## Brand standards

See [Rolling Budget Brand Guidelines](docs/BRAND_GUIDELINES.md) for the approved logo, colors, typography, authentication treatment, and responsive brand usage.

## Email confirmation

New staging signups redirect to the branded `auth-confirmation.html` page. See [staging setup](STAGING.md#email-confirmation) for the required Supabase Auth redirect allowlist entry.
