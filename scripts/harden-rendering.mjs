import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function hardenRendering(source) {
    let html = source.replaceAll('\r\n', '\n');
    function replaceBlock(start, end, replacement) {
        assert.equal(html.split(start).length, 2, 'Ambiguous/missing start: ' + start);
        assert.equal(html.split(end).length, 2, 'Ambiguous/missing end: ' + end);
        const a = html.indexOf(start);
        const b = html.indexOf(end, a + start.length);
        assert.ok(b > a, 'Invalid source boundary');
        html = html.slice(0, a) + replacement + '\n' + html.slice(b);
    }
    replaceBlock('function buildDayOptions(', 'function ordinal(', '');
    replaceBlock('async function renderAuth() {', 'function updateModalUI()', '');
    replaceBlock('window.openRecurringModal = function()', 'window.closeRecurringModal = function()', 'window.openRecurringModal = rbOpenRecurringModal;');
    replaceBlock('    // Month chips:', '    renderPaychecks(m.paychecks);', '    rbNavigation(activeYear);');
    const renderers = readFileSync(new URL('./safe-renderers.js', import.meta.url), 'utf8');
    replaceBlock('function rmBtn(type, i)', 'window.money =', renderers);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write\s*\(/.test(html), 'HTML rendering sink remains');
    return html;
}
