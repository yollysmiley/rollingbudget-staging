const TESTS = new Set([
  "authenticated cloud save survives a fresh browser context",
  "account switching loads only the selected account budget",
  "UI logout clears the signed-in budget before another account is loaded"
]);
const STATUSES = new Set(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);

function safeError(message) {
  return String(message || 'No assertion detail available')
    .replace(/Bearer\\s+[^\\s]+/gi, 'Bearer [redacted]')
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted key]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, '[redacted email]')
    .slice(0, 800);
}

module.exports = class SafeReporter {
  onTestEnd(test, result) {
    const status = STATUSES.has(result.status) ? result.status.toUpperCase() : 'UNKNOWN';
    const title = TESTS.has(test.title) ? test.title : '[unlisted test]';
    console.log(status + ' ' + title);
    if (result.status !== 'passed' && result.status !== 'skipped') {
      const error = result.errors?.[0];
      console.log('ASSERTION ' + safeError(error?.message));
    }
  }
  onStdOut() {}
  onStdErr() {}
  onError() { console.error('Live test infrastructure error; sensitive details suppressed.'); }
  onEnd(result) {
    console.log('Authenticated desktop suite: ' + (STATUSES.has(result.status) ? result.status : 'unknown'));
  }
};
