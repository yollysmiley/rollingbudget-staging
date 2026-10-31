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
