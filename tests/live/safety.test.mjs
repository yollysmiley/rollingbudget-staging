import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredSettings, logoutAccepted, assertOwnedFixture, withDownload } from './safety.mjs';
test('settings are validated only when explicitly requested', () => {
  assert.throws(() => requiredSettings({}), /Missing/);
  const env = { STAGING_PUBLISHABLE_KEY:'sb_publishable_fixture', STAGING_TEST_A_EMAIL:'a@example.invalid', STAGING_TEST_A_PASSWORD:'synthetic-a', STAGING_TEST_B_EMAIL:'b@example.invalid', STAGING_TEST_B_PASSWORD:'synthetic-b' };
  assert.deepEqual(requiredSettings(env),env);
  assert.throws(() => requiredSettings({...env,STAGING_PUBLISHABLE_KEY:'sb_secret_fixture'}), /publishable/);
});
test('logout cleanup accepts only success or exact already-ended-session response', () => {
  assert(logoutAccepted(204,null)); assert(logoutAccepted(200,{})); assert(logoutAccepted(403,{code:'session_not_found'}));
  for (const status of [400,401,403,404,429,500]) assert.equal(logoutAccepted(status,{code:'unexpected'}),false);
  assert.equal(logoutAccepted(401,{code:'session_not_found'}),false);
});
test('404 cleanup requires the exact session_not_found code', () => {
  assert.equal(logoutAccepted(404,{code:'session_not_found'}),true);
  for (const body of [null,undefined,{},'Not Found',{code:'not_found'},{code:'invalid_token'},{message:'session_not_found'},{code:'SESSION_NOT_FOUND'}]) {
    assert.equal(logoutAccepted(404,body),false);
  }
  for (const status of [400,401,429,500,503]) assert.equal(logoutAccepted(status,{code:'session_not_found'}),false);
});
test('fixture cleanup requires exact ID, owner and run marker', () => {
  const row={id:'row',user_id:'owner',state:{integrationRun:'run'}};
  assertOwnedFixture(row,'row','owner','run');
  for (const args of [['other','owner','run'],['row','other','run'],['row','owner','other']]) assert.throws(()=>assertOwnedFixture(row,...args));
});
test('download is deleted even when inspection fails', async () => {
  let deleted=false; const file={delete:async()=>{deleted=true;}};
  await assert.rejects(withDownload(file,async()=>{throw new Error('synthetic assertion failure');}));
  assert.equal(deleted,true);
});

test('fixture cleanup reauthenticates and verifies the exact owner before deletion', async () => {
  const { verifiedCleanupSession } = await import('./safety.mjs');
  const account = { user: { id: 'owner-a' }, access_token: 'revoked-original-token' };
  const fresh = { user: { id: 'owner-a' }, access_token: 'new-token' };
  assert.equal(await verifiedCleanupSession(account, async () => fresh), fresh);
  await assert.rejects(verifiedCleanupSession(account, async () => ({
    user: { id: 'owner-b' }, access_token: 'other-token'
  })), /identity mismatch/);
  await assert.rejects(verifiedCleanupSession(account, async () => ({
    user: { id: 'owner-a' }
  })), /identity mismatch/);
});

test('UI-revoked session is not signed out again during cleanup', async () => {
  const { shouldLogoutOriginalSession } = await import('./safety.mjs');
  const loggedOut = new Set(['owner-a']);
  assert.equal(shouldLogoutOriginalSession(loggedOut, 'owner-a'), false);
  assert.equal(shouldLogoutOriginalSession(loggedOut, 'owner-b'), true);
  assert.equal(shouldLogoutOriginalSession(new Set(), 'owner-a'), true);
});

test('integration account cleanup refuses other runs, owners, and names', async () => {
  const { assertOwnedAccountFixture } = await import('./safety.mjs');
  const row = { id: 'integration-run-1', user_id: 'owner-a', name: 'Integration account run-1' };
  assert.doesNotThrow(() => assertOwnedAccountFixture(row, 'integration-run-1', 'owner-a', 'run-1'));
  for (const bad of [
    [{ ...row, id: 'integration-other' }, 'integration-run-1', 'owner-a', 'run-1'],
    [{ ...row, user_id: 'owner-b' }, 'integration-run-1', 'owner-a', 'run-1'],
    [{ ...row, name: 'Personal account' }, 'integration-run-1', 'owner-a', 'run-1'],
    [row, 'integration-run-1', 'owner-a', 'run-2'],
    [null, 'integration-run-1', 'owner-a', 'run-1']
  ]) assert.throws(() => assertOwnedAccountFixture(...bad), /ownership mismatch/);
});
