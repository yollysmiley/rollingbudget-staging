import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = 'https://phiscfwfuzeptetimdbo.supabase.co';
const env = name => { const v = process.env[name]; assert(v, 'Missing required environment setting: ' + name); return v; };
const key = env('STAGING_PUBLISHABLE_KEY');
assert(key.startsWith('sb_publishable_'), 'Use the staging publishable key, not an admin key');
const run = randomUUID();
const sessions = [];
const created = [];
let failures = 0;
async function request(path, { token, method = 'GET', body } = {}) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (path.startsWith('/rest/')) headers.Prefer = 'return=representation';
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { status: response.status, ok: response.ok, data };
}
function success(r) { assert(r.ok, 'Unexpected HTTP status ' + r.status); }
function denied(r) { assert([401,403].includes(r.status) || (r.ok && Array.isArray(r.data) && r.data.length === 0), 'Unauthorized operation was not denied'); }
async function rows(session) { const r = await request('/rest/v1/budget_data?select=id,user_id,state', {token: session.access_token}); success(r); assert(Array.isArray(r.data)); return r.data; }
async function check(name, fn) { try { await fn(); console.log('PASS ' + name); } catch { failures++; console.error('FAIL ' + name + ' (sensitive response details suppressed)'); } }
try {
  for (const account of ['A','B']) {
    const r = await request('/auth/v1/token?grant_type=password', {method:'POST', body:{email:env('STAGING_TEST_' + account + '_EMAIL'),password:env('STAGING_TEST_' + account + '_PASSWORD')}});
    success(r); assert(r.data?.access_token && r.data?.refresh_token && r.data?.user?.id, 'Invalid sign-in response');
    sessions.push(r.data);
  }
  assert.notEqual(sessions[0].user.id, sessions[1].user.id, 'Two distinct test accounts are required');
  for (const s of sessions) assert.equal((await rows(s)).length, 0, 'Dedicated test account must start with no visible budget records; nothing will be overwritten');
  for (const [index,s] of sessions.entries()) {
    const id = randomUUID();
    const fixture = {id,user_id:s.user.id,state:{integrationRun:run,owner:index,value:100},updated_at:new Date().toISOString()};
    created.push({id,session:s});
    const r = await request('/rest/v1/budget_data',{token:s.access_token,method:'POST',body:fixture}); success(r);
    assert.equal(r.data?.[0]?.id,id);
  }
  for (const [index,s] of sessions.entries()) {
    const own = created[index], other = created[1-index];
    await check('account ' + index + ' reads only its own row',async()=>{const data=await rows(s);assert.equal(data.length,1);assert.equal(data[0].id,own.id);assert.equal(data[0].state.integrationRun,run);});
    await check('account ' + index + ' updates its own row',async()=>{const r=await request('/rest/v1/budget_data?id=eq.'+own.id,{token:s.access_token,method:'PATCH',body:{state:{integrationRun:run,owner:index,value:200}}});success(r);assert.equal(r.data?.length,1);assert.equal((await rows(s))[0].state.value,200);});
    await check('account ' + index + ' cannot read other row',async()=>denied(await request('/rest/v1/budget_data?id=eq.'+other.id,{token:s.access_token})));
    await check('account ' + index + ' cannot update other row',async()=>{denied(await request('/rest/v1/budget_data?id=eq.'+other.id,{token:s.access_token,method:'PATCH',body:{state:{integrationRun:run,unauthorized:true}}}));assert.equal((await rows(other.session))[0].state.unauthorized,undefined);});
    await check('account ' + index + ' cannot delete other row',async()=>{denied(await request('/rest/v1/budget_data?id=eq.'+other.id,{token:s.access_token,method:'DELETE'}));assert.equal((await rows(other.session))[0].id,other.id);});
    await check('account ' + index + ' cannot insert as another owner',async()=>{const r=await request('/rest/v1/budget_data',{token:s.access_token,method:'POST',body:{id:randomUUID(),user_id:other.session.user.id,state:{integrationRun:run}}});assert([401,403].includes(r.status),'Must be permission denial, not uniqueness conflict');});
    await check('account ' + index + ' cannot change ownership',async()=>{const r=await request('/rest/v1/budget_data?id=eq.'+own.id,{token:s.access_token,method:'PATCH',body:{user_id:randomUUID()}});assert([401,403].includes(r.status),'Must be policy denial, not constraint failure');assert.equal((await rows(s))[0].user_id,s.user.id);});
    await check('account ' + index + ' refreshes its real session',async()=>{const r=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh_token}});success(r);assert.equal(r.data?.user?.id,s.user.id);Object.assign(s,r.data);assert.equal((await rows(s))[0].id,own.id);});
  }
  await check('anonymous reads denied',async()=>{const r=await request('/rest/v1/budget_data?select=id');assert([401,403].includes(r.status));});
  await check('anonymous inserts denied',async()=>{const r=await request('/rest/v1/budget_data',{method:'POST',body:{id:randomUUID(),user_id:randomUUID(),state:{integrationRun:run}}});assert([401,403].includes(r.status));});
  for (const method of ['PATCH','DELETE']) await check('anonymous ' + method + ' denied',async()=>{const r=await request('/rest/v1/budget_data?id=eq.'+created[0].id,{method,body:method==='PATCH'?{state:{integrationRun:run}}:undefined});assert([401,403].includes(r.status));});
} catch { failures++; console.error('FAIL setup or fixture creation; sensitive response details suppressed'); }
finally {
  for (const {id,session} of created) await check('cleanup owned synthetic fixture',async()=>{const r=await request('/rest/v1/budget_data?id=eq.'+id+'&user_id=eq.'+session.user.id,{token:session.access_token,method:'DELETE'});success(r);const verify=await request('/rest/v1/budget_data?id=eq.'+id,{token:session.access_token});success(verify);assert.deepEqual(verify.data,[]);});
  for (const s of sessions) await check('sign out test session',async()=>success(await request('/auth/v1/logout?scope=local',{token:s.access_token,method:'POST'})));
}
process.exitCode = failures ? 1 : 0;
