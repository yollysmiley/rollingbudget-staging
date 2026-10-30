import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
export function integrateRelease2(source, prefix) {
    let html = source.replaceAll('\r\n', '\n');
    const once = (old, replacement) => {
        assert.equal(html.split(old).length, 2, 'Release2 source boundary changed: ' + old.slice(0, 80));
        html = html.replace(old, () => replacement);
    };
    const block = (start, end, replacement) => {
        assert.equal(html.split(start).length, 2, 'Release2 missing start: ' + start);
        assert.equal(html.slice(html.indexOf(start)).split(end).length, 2, 'Release2 missing end: ' + end);
        const a = html.indexOf(start), b = html.indexOf(end, a);
        assert.ok(b > a);
        html = html.slice(0, a) + replacement + '\n' + html.slice(b);
    };
    block('window.saveData = async () => {', 'window.update =', '');
    block('if (supabaseClient) supabaseClient.auth.onAuthStateChange(', '</script>', 'rb2Install();\nrender();\n');
    const module = readFileSync(new URL('./release2-state.mjs', import.meta.url), 'utf8').replace(/^export /gm, '');
    const runtime = readFileSync(new URL('./release2-runtime.js', import.meta.url), 'utf8');
    block('function normalizeState(raw)', 'function ordinal(', `const RB2_PREFIX = ${JSON.stringify(prefix)};\nconst RB2 = (() => {\n${module}\nreturn { normalizeMonth, deleteEntity, createAccountStore };\n})();\n${runtime}\n`);
    block('async function signOut()', 'function updateModalUI()', 'async function signOut() { return rb2SignOut(); }');
    once('async function signInWithGitHub() {', 'async function signInWithGitHub() { rb2SigningOut = false;');
    once('!isExclBucket(e.bucketIndex)', '!e.excludedBucketId');
    once('isExclBucket(e.bucketIndex)', 'Boolean(e.excludedBucketId)');
    once('e.bucketIndex === pi', 'e.paycheckId === p.id');
    once('exclBucketIdx(e.bucketIndex) === bi', 'e.excludedBucketId === b.id');
    once("const selected = item.bucketIndex ?? '';", "const selected = item.excludedBucketId ? 'excl_' + item.excludedBucketId : item.paycheckId ? 'pay_' + item.paycheckId : '';");
    once("rbOption(pi, p.name || 'Paycheck ' + (pi + 1), selected === pi)", "rbOption('pay_' + p.id, p.name || 'Paycheck ' + (pi + 1), selected === 'pay_' + p.id)");
    once("rbOption('excl_' + bi, '🔒 ' + (b.name || 'Bucket ' + (bi + 1)), selected === 'excl_' + bi)", "rbOption('excl_' + b.id, '🔒 ' + (b.name || 'Bucket ' + (bi + 1)), selected === 'excl_' + b.id)");
    once("bucket.value === '' ? null : (isNaN(bucket.value) ? bucket.value : parseInt(bucket.value, 10))", 'bucket.value');
    html = html.replace(/localStorage\.getItem\(('[^']*budget_theme')\)/g, '(function() { try { return localStorage.getItem($1); } catch { return null; } })()');
    html = html.replace(/localStorage\.setItem\(('[^']*budget_theme'), t\);/g, 'try { localStorage.setItem($1, t); } catch { /* Theme preference is optional. */ }');
    assert.ok(!html.includes('JSON.parse(localStorage.getItem('), 'Unsafe initialization remains');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(html), 'Unsafe rendering sink');
    return html;
}
