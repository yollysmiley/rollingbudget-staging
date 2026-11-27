import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCiMode, parseRawDiff } from '../scripts/resolve-ci-mode.mjs';
const base='a'.repeat(40), head='b'.repeat(40), merge='c'.repeat(40);
const doc=':100644 100644 abc def M\0README.md\0';
const params={eventName:'pull_request',base,head,merge};
const git=(diff=doc,parents=[merge,base,head].join(' '),second=diff)=>args=>{
  if(args[0]==='rev-parse') return base+'\n';
  if(args[0]==='rev-list') return parents+'\n';
  return args.includes(base+'...'+head)?diff:second;
};
test('immutable matching revisions permit documentation only',()=>assert.equal(resolveCiMode({...params,git:git()}).mode,'lightweight'));
test('stale or mismatched merge parents fail closed',()=>assert.equal(resolveCiMode({...params,git:git(doc,[merge,base,base].join(' '))}).mode,'full'));
test('both PR and merge diffs must qualify',()=>assert.equal(resolveCiMode({...params,git:git(doc,undefined,doc.replace('README.md','app.js'))}).mode,'full'));
test('duplicates, mode changes, additions, malformed records fail closed',()=>{
  for(const raw of [doc+doc,doc.replace('100644 100644','100644 100755'),doc.replace(' M',' A'),doc.slice(0,-1),'']) {
    assert.equal(resolveCiMode({...params,git:git(raw)}).mode,'full');
  }
});
test('main, manual, missing revisions and git failure require full',()=>{
  for(const input of [{eventName:'push'},{eventName:'workflow_dispatch'},{head:''},{git:()=>{throw Error('missing')}}]) assert.equal(resolveCiMode({...params,git:git(),...input}).mode,'full');
});
test('raw diff preserves filenames without shell interpretation',()=>assert.deepEqual(parseRawDiff(doc),[{filename:'README.md',status:'modified'}]));

test('impact exemptions require matching immutable diffs',()=>{
  const css=doc.replace('README.md','styles/brand.css');
  const backup=doc.replace('README.md','scripts/export-staging-backup.sh');
  assert.equal(resolveCiMode({...params,git:git(css)}).mode,'presentation');
  assert.equal(resolveCiMode({...params,git:git(backup)}).mode,'backup');
  for(const other of [backup,doc,css+doc]) assert.equal(resolveCiMode({...params,git:git(css,undefined,other)}).mode,'full');
});
