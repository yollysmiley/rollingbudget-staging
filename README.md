# Rolling Budget — Staging

Isolated staging frontend for Rolling Budget. Use synthetic test data only. Production remains in [yollysmiley/rollingbudget](https://github.com/yollysmiley/rollingbudget).

## Getting started

See [STAGING.md](STAGING.md) for staging configuration, local build instructions, deployment, and Supabase setup.

## Documentation

- [Feature specifications](docs/FEATURE_SPECIFICATIONS.md) — budget behavior, due days, recurring rules, year planning, and cloud recovery.
- [Architecture and authentication](docs/ARCHITECTURE.md) — public and protected routes, authentication, database security, and responsive application structure.
- [CI responsibilities](docs/CI_RESPONSIBILITIES.md) — workflow ownership, required checks, and test-data isolation.
- [Browser acceptance tests](docs/browser-tests.md) — desktop/mobile testing guidance.
- [Brand guidelines](docs/BRAND_GUIDELINES.md) — logo, palette, typography, and authentication branding.
- [Dynamic account management plan](docs/DYNAMIC_ACCOUNT_MANAGEMENT_PLAN.md) — historical implementation contract (verify status against the application).
- [Staging backup](docs/STAGING_BACKUP.md) — authorized encrypted export and recovery gates.
- [Changelog](CHANGELOG.md) — chronological implementation and release history.

## Development and validation

The staging build and test commands are documented in [STAGING.md](STAGING.md) and [CI responsibilities](docs/CI_RESPONSIBILITIES.md). Pull requests must pass the existing unit and desktop/mobile regression checks. Production is not a build target.
