# Changelog

## Unreleased

- Aligned authenticated staging API and browser integration tests with the current redesigned dashboard and `budget_ui_years` storage table; legacy Release 2 `budget_data` remains untouched.
- Removed the unused pinned production-repository checkout from the live staging workflow so builds and tests use the exact staging application revision.
- Replaced obsolete Release 2 browser assertions with coverage for authenticated cloud save/restore, account switching isolation, and logout clearing.
- Updated live-test documentation to state the reserved fixture years and current test scope.

- Added the Rolling Budget brand guidelines as the reference for logo construction, color palette, typography, and brand voice.
- Updated Sign In, Create Account, and Forgot Password dialogs with the official three-bar logo, clearer copy, inline feedback, and responsive controls.
- Moved Recurring Rules and Year Management into the mobile navigation sidebar and simplified the Settings view to account and cloud-sync access.
- Standardized mobile navigation and authentication touch targets; added desktop and mobile regression coverage for the new behavior.

- Removed the Recurring Rules Manager back button; users return to Overview, Plan, or Settings through the navigation menu. Kept navigation accessible while the manager is open.
- Added a dedicated Recurring Rules Manager with distinct desktop table and mobile card views.
- Added monthly, every-two-months, quarterly, every-six-months, and annual frequencies; removed the end-month field.
- Added enable/disable controls and regression coverage for frequency placement, legacy-rule safety, and mobile overflow.
