import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../rollover-budget-app.html',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build-staging.mjs',import.meta.url),'utf8');
test('public homepage has responsive sign-in and account creation actions',()=>{assert.match(home,/name="viewport"/);assert.match(home,/app\/\?auth=signin/);assert.match(home,/app\/\?auth=signup/);assert.match(home,/Rolling Budget/);});
test('app stays hidden until Supabase verifies user and redirects guests',()=>{assert.match(app,/html:not\(\.budget-authenticated\)/);assert.match(app,/auth\.getUser\(\)/);assert.match(app,/window\.location\.replace\(home\)/);assert.match(app,/db = \{\}/);});
test('build emits separate public homepage and protected app',()=>{assert.match(build,/dist\/index.html/);assert.match(build,/dist\/app\/index.html/);});
