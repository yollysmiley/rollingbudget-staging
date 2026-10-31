const CHECKPOINTS = new Set([
  "setup.settings",
  "setup.signin.A",
  "setup.signin.B",
  "setup.accounts-distinct",
  "setup.empty.A",
  "setup.empty.B",
  "setup.fixture-ids",
  "cleanup.context",
  "cleanup.fixture.A",
  "cleanup.fixture.B",
  "cleanup.session.A",
  "cleanup.session.B",
  "modal.seed",
  "modal.open-account-A",
  "modal.open-recurring",
  "modal.select-recurring",
  "modal.signout-call",
  "modal.account-cleared",
  "modal.overlay-closed",
  "modal.list-cleared",
  "modal.selection-cleared",
  "modal.budget-cleared",
  "modal.switch-account-B",
  "modal.account-B-visible",
  "modal.account-B-recurring",
  "modal.account-A-cloud-unchanged",
  "tabs.seed",
  "tabs.open-first",
  "tabs.open-second",
  "tabs.logout-first",
  "tabs.second-account-cleared",
  "tabs.second-budget-cleared"
]);
const TESTS = new Set([
  "cloud save through UI survives fresh browser context",
  "logout closes open selected recurring modal before B loads",
  "delayed A cloud result cannot replace active B state",
  "failed logout clears displayed budget and reports failure",
  "corrupt local account state blocks saving and exports originals",
  "local storage failure prevents cloud overwrite",
  "UI logout propagates to another tab without retaining account budget",
  "paychecks deletion at position 0 preserves other references",
  "paychecks deletion at position 1 preserves other references",
  "paychecks deletion at position 2 preserves other references",
  "excludedBuckets deletion at position 0 preserves other references",
  "excludedBuckets deletion at position 1 preserves other references",
  "excludedBuckets deletion at position 2 preserves other references"
]);
const STATUSES = new Set(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
module.exports = class SafeReporter {
  constructor() { this.lastStarted = new WeakMap(); }
  onStepBegin(test, result, step) {
    if (step.category === 'test.step' && CHECKPOINTS.has(step.title)) {
      this.lastStarted.set(result, step.title);
      console.log('START STEP ' + step.title);
    }
  }
  onStepEnd(test, result, step) {
    if (step.category === 'test.step' && CHECKPOINTS.has(step.title)) {
      console.log((step.error ? 'FAILED STEP ' : 'PASSED STEP ') + step.title);
    }
  }
  onTestEnd(test, result) {
    const status = STATUSES.has(result.status) ? result.status.toUpperCase() : 'UNKNOWN';
    const title = TESTS.has(test.title) ? test.title : '[unlisted test]';
    console.log(status + ' ' + title);
    if (result.status !== 'passed' && result.status !== 'skipped') {
      console.log('LAST STARTED CHECKPOINT ' + (this.lastStarted.get(result) || '[none: runner or fixture setup]'));
    }
    this.lastStarted.delete(result);
  }
  onStdOut() {}
  onStdErr() {}
  onError() { console.error('Live test infrastructure error; sensitive details suppressed.'); }
  onEnd(result) {
    console.log('Authenticated desktop suite: ' + (STATUSES.has(result.status) ? result.status : 'unknown'));
  }
};
