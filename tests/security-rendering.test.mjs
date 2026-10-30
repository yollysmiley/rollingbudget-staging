import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function fixture() {
    class Element {
        constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.events = {}; this.classList = { add() {}, remove() {} }; }
        set textContent(value) { this.text = String(value); this.children = []; }
        get textContent() { return (this.text || '') + this.children.map(x => x.textContent).join(''); }
        append(...children) { this.children.push(...children); }
        replaceChildren(...children) { this.text = ''; this.children = children; }
        addEventListener(name, fn) { this.events[name] = fn; }
        get firstChild() { return this.children[0]; }
    }
    const ids = new Map();
    const document = { createElement: tag => new Element(tag), getElementById: id => { if (!ids.has(id)) ids.set(id, new Element('div')); return ids.get(id); } };
    const payload = '\"><img src=x onerror=alert(1)><svg onload=alert(2)>';
    const item = { name: payload, category: payload, note: payload, amount: 10, date: '', balanceAfter: 10, bucketExpenses: 0, remaining: 10 };
    const state = { activeYearIndex: 0, recurring: [item], years: [{ year: payload, activeMonth: 0, months: [{ name: payload }] }] };
    const calls = [];
    const context = vm.createContext({ document, URL, console, state, modalSelections: new Set(), money: n => String(n || 0), ordinal: String, updateModalUI() {}, toggleRecurringItem() {}, signOut() {}, signInWithGitHub() {}, setActive() {}, removeItem() {}, removeExcluded() {}, removeRec() {}, update: (...args) => calls.push(args), updateRec() {}, updateExcluded() {}, supabaseClient: { auth: { getUser: async () => ({ data: { user: { email: payload, user_metadata: { full_name: payload, avatar_url: 'javascript:alert(1)' } } } }) } } });
    vm.runInContext(readFileSync(new URL('../scripts/safe-renderers.js', import.meta.url), 'utf8'), context);
    return { context, ids, document, payload, item, state, calls };
}
function flatten(el) { return [el, ...el.children.flatMap(flatten)]; }

test('budget text stays text; controls retain values and listeners', () => {
    const f = fixture();
    f.context.renderPaychecks([f.item]);
    f.context.renderExcludedBuckets([f.item]);
    f.context.renderExpenses([f.item], [f.item], [f.item]);
    f.context.renderRecurringList();
    f.context.renderSummary({ months: [{ ...f.item }] });
    f.context.rbNavigation(f.state.years[0]);
    f.context.rbOpenRecurringModal();
    const all = [...f.ids.values()].flatMap(flatten);
    assert.equal(all.some(el => ['img', 'svg', 'script'].includes(el.tagName)), false);
    assert.ok(all.some(el => el.tagName === 'input' && el.value === f.payload));
    assert.ok(all.some(el => el.tagName === 'option' && el.textContent.includes(f.payload)));
    const input = flatten(f.ids.get('paycheckContainer')).find(el => el.tagName === 'input');
    input.value = 'Edited';
    input.events.change();
    assert.equal(f.calls[0][2], 'name');
    assert.equal(f.calls[0][3], 'Edited');
});
test('profile text and invalid avatar do not create HTML', async () => {
    const f = fixture();
    await f.context.renderAuth();
    const nodes = flatten(f.ids.get('authContainer'));
    assert.ok(nodes.some(el => el.tagName === 'span' && el.textContent === f.payload));
    assert.equal(nodes.some(el => el.tagName === 'img'), false);
});
test('avatar URLs require absolute HTTPS without credentials', () => {
    const { context: c } = fixture();
    for (const value of ['javascript:alert(1)', 'data:image/svg+xml,x', '//example.com/x', 'http://example.com/x', 'https://u:p@example.com/x', '', null]) assert.equal(c.rbAvatarUrl(value), null);
    assert.equal(c.rbAvatarUrl('https://avatars.githubusercontent.com/u/1'), 'https://avatars.githubusercontent.com/u/1');
});
