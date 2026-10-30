import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { requiredSettings, logoutAccepted, assertOwnedFixture, withDownload } from './safety.mjs';
const URL = 'https://phiscfwfuzeptetimdbo.supabase.co';
const PREFIX = 'rollingbudget_staging_phiscfwfuzeptetimdbo';
const RUN = randomUUID();
let settings;
let accounts = [];
const owned = new Map();
async function response(path, session, method = 'GET', body) {
  const r = await fetch(URL + path, { method, headers: { apikey: settings.STAGING_PUBLISHABLE_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return {ok:r.ok,status:r.status,data};
}
async function api(path, session, method = 'GET', body) {
  const r = await response(path,session,method,body);
  if (!r.ok) throw new Error('Staging API request failed');
  return r.data;
}
async function rows(a) { return api('/rest/v1/budget_data?select=id,user_id,state&user_id=eq.' + a.user.id,a); }
function fixture(label) {
  return {integrationRun:RUN,release2Version:2,activeYearIndex:0,recurring:[{name:label+'-BILL',amount:10}],years:[{year:'2026',activeMonth:0,months:Array.from({length:12},(_,i)=>({paychecks:i===0?[{id:randomUUID(),name:label,amount:100,date:''}]:[],expenses:[],excludedBuckets:[]}))}]};
}
async function seed(a,data) {
  const id = owned.get(a.user.id);
  const result = await api('/rest/v1/budget_data',a,'POST',{id,user_id:a.user.id,state:data});
  expect(result[0].id).toBe(id);
}
async function guestPage(context) {
  const page = await context.newPage();
  page.on('dialog',d=>d.dismiss());
  await page.goto('/rollover-budget-app.html');
  await expect.poll(()=>page.evaluate(()=>typeof rb2Account!=='undefined' && rb2Account===null)).toBe(true);
  return page;
}
async function settled(page,a) {
  await expect.poll(()=>page.evaluate(id=>rb2Account===id && !rb2Loading && !rb2Blocked,a.user.id)).toBe(true);
}
async function switchTo(page,a,ready=true) {
  const failed=await page.evaluate(async s=>{
    rb2SigningOut=false;
    const {error}=await supabaseClient.auth.setSession({access_token:s.access_token,refresh_token:s.refresh_token});
    return Boolean(error);
  },{access_token:a.access_token,refresh_token:a.refresh_token});
  expect(failed).toBe(false);
  if(ready) await settled(page,a);
}
async function open(context,a) {
  const page=await guestPage(context);
  await switchTo(page,a);
  return page;
}
async function save(page) {
  const dialog=page.waitForEvent('dialog');
  await page.locator('.nav-group button[onclick="saveData()"]').click();
  expect((await dialog).message()).toBe('Saved locally and synced.');
}
async function signedOut(page) {
  await expect.poll(()=>page.evaluate(()=>rb2Account===null)).toBe(true);
}
async function logout(page) {
  await page.locator('#authContainer').getByRole('button',{name:'Sign Out'}).click();
  await signedOut(page);
}
async function cloudName(a) {
  const data=await rows(a);
  expect(data).toHaveLength(1);
  assertOwnedFixture(data[0],owned.get(a.user.id),a.user.id,RUN);
  return data[0].state.years[0].months[0].paychecks[0].name;
}
test.beforeEach(async()=>{
  accounts=[];owned.clear();
  settings=requiredSettings(process.env);
  for(const letter of ['A','B']) {
    const r=await fetch(URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:settings.STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:settings['STAGING_TEST_'+letter+'_EMAIL'],password:settings['STAGING_TEST_'+letter+'_PASSWORD']}),signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error('Test account sign-in failed');
    const s=await r.json();
    if(!s.user?.id || !s.access_token || !s.refresh_token) throw new Error('Invalid test session');
    accounts.push(s);
  }
  expect(accounts[0].user.id).not.toBe(accounts[1].user.id);
  for(const a of accounts) expect(await rows(a)).toHaveLength(0);
  for(const a of accounts) owned.set(a.user.id,randomUUID());
});
test.afterEach(async({context})=>{
  let failed=false;
  try { await context.close(); } catch { failed=true; }
  for(const a of accounts) {
    try {
      const id=owned.get(a.user.id);
      if(id) {
        const row=(await rows(a)).find(r=>r.id===id);
        if(row) {
          assertOwnedFixture(row,id,a.user.id,RUN);
          await api('/rest/v1/budget_data?id=eq.'+id+'&user_id=eq.'+a.user.id,a,'DELETE');
        }
        expect((await rows(a)).some(r=>r.id===id)).toBe(false);
      }
    } catch { failed=true; }
    try {
      const r=await response('/auth/v1/logout?scope=local',a,'POST');
      if(!logoutAccepted(r.status,r.data)) throw new Error('Unexpected session cleanup response');
    } catch { failed=true; }
  }
  if(failed) throw new Error('Cleanup failed; inspect dedicated staging fixtures and sessions');
});
test('cloud save through UI survives fresh browser context',async({browser,context})=>{
  const a=accounts[0];
  await seed(a,fixture('CLOUD'));
  const page=await open(context,a);
  await page.locator('#paycheckContainer input[type=text]').first().fill('UI-SAVED');
  await page.locator('#paycheckContainer input[type=text]').first().press('Tab');
  await page.locator('#paycheckContainer input[type=number]').first().fill('4321.25');
  await page.locator('#kpiEnd').click();
  await save(page);
  expect(await cloudName(a)).toBe('UI-SAVED');
  const fresh=await browser.newContext({locale:'en-US',trace:'off'});
  try {
    const other=await open(fresh,a);
    await expect(other.locator('#paycheckContainer input[type=text]').first()).toHaveValue('UI-SAVED');
    await expect(other.locator('#kpiEnd')).toHaveText('$4,321.25');
  } finally { await fresh.close(); }
});
test('logout closes open selected recurring modal before B loads',async({context})=>{
  const [a,b]=accounts;
  await seed(a,fixture('ACCOUNT-A'));await seed(b,fixture('ACCOUNT-B'));
  const page=await open(context,a);
  await page.locator('button[onclick="openRecurringModal()"]').click();
  await expect(page.locator('#recSelectList')).toContainText('ACCOUNT-A-BILL');
  await page.locator('.rec-select-item').first().click();
  expect(await page.evaluate(()=>modalSelections.size)).toBe(1);
  // Controlled app action: modal overlay prevents clicking the underlying sign-out button.
  await page.evaluate(()=>signOut());
  await signedOut(page);
  await expect(page.locator('#recurringModal')).not.toHaveClass(/open/);
  await expect(page.locator('#recSelectList')).toBeEmpty();
  expect(await page.evaluate(()=>modalSelections.size)).toBe(0);
  await expect(page.locator('#paycheckContainer input')).toHaveCount(0);
  await switchTo(page,b);
  await expect(page.locator('#paycheckContainer input[type=text]').first()).toHaveValue('ACCOUNT-B');
  await page.locator('button[onclick="openRecurringModal()"]').click();
  await expect(page.locator('#recSelectList')).toContainText('ACCOUNT-B-BILL');
  await expect(page.locator('#recSelectList')).not.toContainText('ACCOUNT-A');
  expect(await cloudName(a)).toBe('ACCOUNT-A');
});
test('delayed A cloud result cannot replace active B state',async({context})=>{
  const [a,b]=accounts;
  await seed(a,fixture('DELAY-A'));await seed(b,fixture('DELAY-B'));
  const page=await open(context,a);
  let release,entered;
  const gate=new Promise(r=>release=r);
  const started=new Promise(r=>entered=r);
  await page.route('**/rest/v1/budget_data*',async route=>{
    if(route.request().method()==='GET' && new globalThis.URL(route.request().url()).searchParams.get('user_id')==='eq.'+a.user.id) {
      const r=await route.fetch();entered();await gate;await route.fulfill({response:r});
    } else await route.continue();
  });
  const pending=page.evaluate(()=>window.loadFromCloud());
  try {
    await started;await switchTo(page,b);release();await pending;
    await expect(page.locator('#paycheckContainer input[type=text]').first()).toHaveValue('DELAY-B');
    expect(await page.evaluate(()=>rb2Blocked)).toBe(false);
  } finally { release();await page.unrouteAll({behavior:'wait'});await pending.catch(()=>{}); }
});
test('failed logout clears displayed budget and reports failure',async({context})=>{
  const a=accounts[0];await seed(a,fixture('LOGOUT'));
  const page=await open(context,a);
  await page.route('**/auth/v1/logout*',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({msg:'Synthetic logout failure'})}));
  await logout(page);
  await expect(page.locator('#release2Notice')).toContainText('sign-out failed');
  await expect(page.locator('#paycheckContainer input')).toHaveCount(0);
  expect(await cloudName(a)).toBe('LOGOUT');
});
test('corrupt local account state blocks saving and exports originals',async({context})=>{
  const a=accounts[0];await seed(a,fixture('RECOVERY'));
  const page=await guestPage(context);
  const key=PREFIX+':release2:account:'+encodeURIComponent(a.user.id);
  await page.evaluate(k=>localStorage.setItem(k,'{broken'),key);
  await switchTo(page,a,false);
  await expect(page.locator('#release2Notice')).toContainText('saving is blocked');
  await page.locator('.nav-group button[onclick="saveData()"]').click();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export recovery data'}).click();
  await withDownload(await pending,async file=>{
    const data=JSON.parse(await readFile(await file.path(),'utf8'));
    expect(data.current).toBe('{broken');expect(data.accountId).toBe(a.user.id);expect(data.draft.schemaVersion).toBe(2);
    expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe('{broken');
    expect(await cloudName(a)).toBe('RECOVERY');
  });
});
test('local storage failure prevents cloud overwrite',async({context})=>{
  const a=accounts[0];await seed(a,fixture('UNCHANGED'));
  const page=await open(context,a);
  await page.locator('#paycheckContainer input[type=number]').first().fill('999');
  await page.locator('#kpiEnd').click();
  let writes=0;
  page.on('request',r=>{if(r.url().startsWith(URL+'/rest/v1/') && !['GET','HEAD','OPTIONS'].includes(r.method())) writes++;});
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k.includes(':release2:')) throw new DOMException('Synthetic quota failure','QuotaExceededError');return original.call(this,k,v);};
  });
  await page.locator('.nav-group button[onclick="saveData()"]').click();
  await expect(page.locator('#release2Notice')).toContainText('Local save failed; cloud was not changed');
  expect(writes).toBe(0);expect((await rows(a))[0].state.years[0].months[0].paychecks[0].amount).toBe(100);
});
test('UI logout propagates to another tab without retaining account budget',async({context})=>{
  const a=accounts[0];await seed(a,fixture('TWO-TABS'));
  const first=await open(context,a);
  const second=await context.newPage();second.on('dialog',d=>d.dismiss());
  await second.goto('/rollover-budget-app.html');await settled(second,a);
  await logout(first);
  await expect.poll(()=>second.evaluate(()=>rb2Account===null)).toBe(true);
  await expect(second.locator('#paycheckContainer input')).toHaveCount(0);
});
for(const kind of ['paychecks','excludedBuckets']) for(const position of [0,1,2]) {
  test(kind+' deletion at position '+position+' preserves other references',async({context})=>{
    const a=accounts[0],data=fixture('DELETE'),m=data.years[0].months[0];
    const entities=Array.from({length:3},(_,i)=>({id:randomUUID(),name:'ENTITY-'+i,amount:100,date:''}));
    m[kind]=entities;
    const ref=kind==='paychecks'?'paycheckId':'excludedBucketId';
    m.expenses=entities.map((e,i)=>({name:'EXPENSE-'+i,amount:10,paycheckId:null,excludedBucketId:null,[ref]:e.id}));
    await seed(a,data);
    const page=await open(context,a);
    const container=kind==='paychecks'?'#paycheckContainer':'#excludedBucketContainer';
    await page.locator(container+' .btn-remove').nth(position).click();
    const values=await page.locator('#expenseContainer .row-expense').evaluateAll(rows=>rows.map(row=>{
      const selects=row.querySelectorAll('select');return selects[selects.length-1].value;
    }));
    expect(values[position]).toBe('');
    for(let i=0;i<3;i++) if(i!==position) expect(values[i]).toBe((kind==='paychecks'?'pay_':'excl_')+entities[i].id);
    await save(page);
    const cloud=(await rows(a))[0].state.years[0].months[0];
    expect(cloud.expenses[position][ref]).toBe(null);
    for(let i=0;i<3;i++) if(i!==position) expect(cloud.expenses[i][ref]).toBe(entities[i].id);
  });
}
