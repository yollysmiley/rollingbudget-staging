/**
 * Fail-closed classification for one complete pull-request diff.
 * This module is intentionally not wired into any workflow until the gate
 * semantics and their regression tests are separately approved and verified.
 */
import { readFileSync } from 'node:fs';

// Exact names only. New documents, renamed documents, and workflow/test changes
// deliberately require full validation until their effects are reviewed.
export const LIGHTWEIGHT_DOC_PATHS = Object.freeze(new Set([
  'README.md',
  'docs/ARCHITECTURE.md',
  'docs/BRAND_GUIDELINES.md',
  'docs/CI_RESPONSIBILITIES.md',
  'docs/FEATURE_SPECIFICATIONS.md',
  'docs/browser-tests.md',
  'CHANGELOG.md',
]));

const VALID_STATUSES = new Set(['modified', 'added', 'removed', 'renamed', 'copied', 'changed']);
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[a-zA-Z0-9_.\/-]+$/;

export function classifyCiChanges({ eventName, files, complete = false } = {}) {
  if (eventName !== 'pull_request') {
    return { mode: 'full', reason: 'non-pull-request event' };
  }
  if (complete !== true || !Array.isArray(files) || files.length === 0) {
    return { mode: 'full', reason: 'incomplete or empty change list' };
  }
  for (const file of files) {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      return { mode: 'full', reason: 'invalid change record' };
    }
    const { filename, status, previous_filename: previousFilename } = file;
    if (typeof filename !== 'string' || !SAFE_PATH.test(filename) ||
        typeof status !== 'string' || !VALID_STATUSES.has(status)) {
      return { mode: 'full', reason: 'invalid path or status' };
    }
    if (status === 'renamed' || status === 'copied' ||
        (previousFilename !== undefined && previousFilename !== null)) {
      return { mode: 'full', reason: 'renamed, copied or ambiguous path' };
    }
    if (status !== 'modified' || !LIGHTWEIGHT_DOC_PATHS.has(filename)) {
      return { mode: 'full', reason: 'change requires validation' };
    }
  }
  return { mode: 'lightweight', reason: 'all changes are modifications to explicitly allowlisted documentation' };
}

// A CLI interface is provided for later workflow integration. The workflow must
// fetch the *complete* paginated PR diff; otherwise it passes complete=false.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Expected one JSON input filename');
    const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(`${JSON.stringify(classifyCiChanges(input))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({ mode: 'full', reason: 'classification input unavailable or invalid' })}\n`);
    process.exitCode = 1;
  }
}
