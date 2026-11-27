import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCiMode } from '../scripts/resolve-ci-mode.mjs';

const doc = { filename: 'README.md', status: 'modified' };
const changed = { filename: 'scripts/build-staging.mjs', status: 'modified' };
const params = { eventName: 'pull_request', repository: 'yollysmiley/rollingbudget-staging',
  pullRequestNumber: '98', expectedChangedFiles: '1', token: 'mock-token' };
const api = (pages) => async (url, options) => {
  assert.match(url, /^https:\/\/api.github.com\/repos\/yollysmiley\/rollingbudget-staging\/pulls\/98\/files\?per_page=100&page=/);
  assert.equal(options.headers.Authorization, 'Bearer mock-token');
  const page = Number(new URL(url).searchParams.get('page'));
  const value = pages[page - 1];
  return value instanceof Error ? Promise.reject(value) : value;
};
const ok = (files) => ({ ok: true, json: async () => files });
const mode = async (options) => (await resolveCiMode({ ...params, ...options })).mode;

test('trusted PR file enumeration permits explicitly allowlisted documentation-only changes', async () => {
  assert.equal(await mode({ fetchImpl: api([ok([doc])]) }), 'lightweight');
});

test('mixed changes in complete PR diff require full validation', async () => {
  assert.equal(await mode({ expectedChangedFiles: 2, fetchImpl: api([ok([doc, changed])]) }), 'full');
});

test('complete multipage enumeration is required, including later-page sensitive changes', async () => {
  const page1 = Array.from({ length: 100 }, () => doc);
  assert.equal(await mode({ expectedChangedFiles: 101, fetchImpl: api([ok(page1), ok([doc])]) }), 'lightweight');
  assert.equal(await mode({ expectedChangedFiles: 101, fetchImpl: api([ok(page1), ok([changed])]) }), 'full');
  assert.equal(await mode({ expectedChangedFiles: 101, fetchImpl: api([ok(page1), ok([])]) }), 'full');
});

test('partial responses, HTTP errors and API exceptions fail closed', async () => {
  assert.equal(await mode({ expectedChangedFiles: 2, fetchImpl: api([ok([doc])]) }), 'full');
  assert.equal(await mode({ fetchImpl: api([{ ok: false, status: 403 }]) }), 'full');
  assert.equal(await mode({ fetchImpl: api([ok({ files: [doc] })]) }), 'full');
  assert.equal(await mode({ fetchImpl: api([new Error('offline')]) }), 'full');
});

test('missing or untrusted event metadata cannot exempt tests', async () => {
  for (const input of [
    { eventName: 'push' }, { eventName: 'workflow_dispatch' },
    { token: '' }, { repository: '../other' }, { pullRequestNumber: '0' },
    { expectedChangedFiles: '0' }, { expectedChangedFiles: '3001' },
    { expectedChangedFiles: 'bogus' },
  ]) assert.equal(await mode({ fetchImpl: api([ok([doc])]), ...input }), 'full');
});

test('renamed, deleted and unknown documentation never qualify for exemption', async () => {
  for (const file of [
    { filename: 'README.md', status: 'renamed', previous_filename: 'old.md' },
    { filename: 'README.md', status: 'removed' },
    { filename: 'docs/new.md', status: 'modified' },
  ]) assert.equal(await mode({ fetchImpl: api([ok([file])]) }), 'full');
});
