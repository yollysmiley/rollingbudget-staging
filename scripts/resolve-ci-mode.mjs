/**
 * Resolve the CI mode using the complete, paginated PR diff.
 * The build workflow must execute this file and its classifier from the
 * immutable PR base commit, not from the untrusted PR head.
 */
import { pathToFileURL } from 'node:url';
import { classifyCiChanges } from './classify-ci-changes.mjs';

const full = (reason) => ({ mode: 'full', reason });
const MAX_PR_FILES = 3000; // GitHub's pull-request files API limit.
const PAGE_SIZE = 100;

export async function resolveCiMode({
  eventName, repository, pullRequestNumber, expectedChangedFiles, token,
  fetchImpl = fetch,
} = {}) {
  if (eventName !== 'pull_request') return full('non-pull-request event');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') ||
      !/^[1-9][0-9]*$/.test(String(pullRequestNumber ?? '')) ||
      !/^[1-9][0-9]*$/.test(String(expectedChangedFiles ?? '')) ||
      typeof token !== 'string' || token.length === 0) {
    return full('missing or invalid PR metadata');
  }

  const expected = Number(expectedChangedFiles);
  if (!Number.isSafeInteger(expected) || expected > MAX_PR_FILES) {
    return full('PR diff exceeds safe enumeration limit');
  }

  const files = [];
  try {
    for (let page = 1; files.length < expected; page++) {
      const url = `https://api.github.com/repos/${repository}/pulls/${pullRequestNumber}/files?per_page=${PAGE_SIZE}&page=${page}`;
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response?.ok) return full('PR files API request failed');
      const batch = await response.json();
      if (!Array.isArray(batch) || batch.length !== Math.min(PAGE_SIZE, expected - files.length)) {
        return full('incomplete or inconsistent PR file enumeration');
      }
      files.push(...batch);
    }
  } catch {
    return full('PR files API unavailable');
  }

  if (files.length !== expected) return full('incomplete PR diff');
  return classifyCiChanges({ eventName, files, complete: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const decision = await resolveCiMode({
    eventName: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    pullRequestNumber: process.env.PR_NUMBER,
    expectedChangedFiles: process.env.EXPECTED_CHANGED_FILES,
    token: process.env.GH_API_TOKEN,
  });
  // Only the decision token reaches the calling workflow; never print API credentials.
  process.stdout.write(`${decision.mode}\n`);
}
