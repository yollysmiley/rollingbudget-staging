# PR 5 review fixes

Status: prepared, not verified passing. Credentials are step-scoped to API and browser execution only. Install/build/discovery steps receive no staging account credentials. Install uses --ignore-scripts; a verified committed lockfile and npm ci conversion remain outstanding. No claim of full dependency reproducibility is made.

New secret-free PR validation checks JavaScript syntax, runs four synthetic safety-helper tests and discovers the 13 Playwright cases. Live settings are validated in beforeEach, not module initialization. Discovery does not authenticate or write fixtures. Live execution remains main-only/protected.

Cleanup closes the browser context, deletes only exact tracked ID/owner/run fixtures, verifies deletion, and revokes sessions. Revocation accepts 200/204 or exactly 403 with code session_not_found; other errors still fail. Recovery download deletion runs in finally with helper regression coverage. Context closure removes remaining context-owned downloads even after assertion failure. No credentialed artifacts are uploaded.

Modal coverage keeps the modal open with a selected A bill and invokes the actual app signOut handler because the overlay blocks the underlying button. It asserts overlay closure, empty list, zero selections and empty guest budget, then verifies B content excludes A. Separate multi-tab coverage still clicks the real Sign Out UI button. Dead deletion-test code was removed and the suite reformatted.

No production or application behavior changes, no merge, and no live test results are implied by this revision.
