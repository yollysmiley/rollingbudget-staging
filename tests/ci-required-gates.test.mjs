import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ci = readFileSync(new URL('../.github/workflows/build-staging.yml', import.meta.url), 'utf8');
function gate(name) {
  const section = ci.split('      - name: '+name+'\n')[1];
  assert.ok(section, name);
  const body = section.split('        run: |\n')[1];
  assert.ok(body, name);
  return body.split('\n').filter((_,i,lines)=>i < (lines.findIndex(l=>!l.startsWith('          ')) < 0 ? lines.length : lines.findIndex(l=>!l.startsWith('          ')))).map(l=>l.slice(10)).join('\n');
}
const statuses = ['success','failure','cancelled','skipped',''];
const modes = ['full','lightweight','presentation','backup','unknown',''];
function execute(script, env) {
  const result = spawnSync('bash',['-e','-c',script],{env:{...process.env,GITHUB_STEP_SUMMARY:'/dev/null',...env},encoding:'utf8'});
  assert.ifError(result.error);
  assert.equal(result.signal,null);
  return result.status;
}
test('build gate accepts only successful recognized classification',()=>{
  const script=gate('Enforce successful classification');
  assert.ok(script.includes('CLASSIFICATION'));
  for(const CLASSIFICATION of statuses) for(const MODE of modes) {
    assert.equal(execute(script,{CLASSIFICATION,MODE}),CLASSIFICATION==='success' && modes.slice(0,4).includes(MODE)?0:1,JSON.stringify({CLASSIFICATION,MODE}));
  }
});
test('database gate rejects every unexpected result',()=>{
  const script=gate('Enforce required PostgreSQL result');
  assert.ok(script.includes('DATABASE'));
  for(const CLASSIFICATION of statuses) for(const MODE of modes) for(const DATABASE of statuses) {
    const expected=CLASSIFICATION==='success' && (MODE==='full'?DATABASE==='success':modes.slice(1,4).includes(MODE)&&DATABASE==='skipped');
    assert.equal(execute(script,{CLASSIFICATION,MODE,DATABASE}),expected?0:1,JSON.stringify({CLASSIFICATION,MODE,DATABASE}));
  }
});
