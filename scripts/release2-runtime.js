const rb2Store = RB2.createAccountStore({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, RB2_PREFIX);
let rb2Account;
let rb2Blocked = false;
let rb2SigningOut = false;
let rb2CloudRecovery = null;
let rb2Revision = 0;
let rb2Loading = false;
const rb2Object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function rb2Array(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error('Invalid saved collection');
    return value;
}
function rb2Row(value) {
    if (!rb2Object(value)) throw new Error('Invalid saved row');
    const amount = value.amount === undefined || value.amount === '' ? 0 : Number(value.amount);
    if (!['number', 'string', 'undefined'].includes(typeof value.amount) || !Number.isFinite(amount)) throw new Error('Invalid saved amount');
    const dueDay = Number(value.dueDay);
    return { ...value, name: typeof value.name === 'string' ? value.name : '', amount, category: typeof value.category === 'string' ? value.category : '', date: typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : '', dueDay: Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : null };
}
function normalizeState(raw) {
    if (!rb2Object(raw)) throw new Error('Invalid budget state');
    if (raw.release2Version !== undefined && raw.release2Version !== 2) throw new Error('Unsupported budget version');
    const years = rb2Array(raw.years).map(year => {
        if (!rb2Object(year)) throw new Error('Invalid year');
        const input = rb2Array(year.months);
        if (input.length > 12) throw new Error('Too many months');
        const months = MONTHS.map((name, index) => {
            const m = input[index] === undefined ? {} : input[index];
            if (!rb2Object(m)) throw new Error('Invalid month');
            const expenses = rb2Array(m.expenses).map(value => {
                const row = rb2Row(value);
                if (!Object.hasOwn(row, 'paycheckId') && !Object.hasOwn(row, 'excludedBucketId')) {
                    if (Number.isInteger(row.bucketIndex)) row.paycheckIndex = row.bucketIndex;
                    else if (typeof row.bucketIndex === 'string' && /^excl_\d+$/.test(row.bucketIndex)) row.excludedBucketIndex = Number(row.bucketIndex.slice(5));
                }
                delete row.bucketIndex;
                return row;
            });
            const normalized = RB2.normalizeMonth({ ...m, name, paychecks: rb2Array(m.paychecks).map(rb2Row), excludedBuckets: rb2Array(m.excludedBuckets).map(rb2Row), expenses });
            normalized.expenses.forEach(row => { if (row.paycheckId && row.excludedBucketId) throw new Error('Ambiguous expense assignment'); });
            return normalized;
        });
        return { ...year, year: String(year.year ?? new Date().getFullYear()), months, activeMonth: Number.isInteger(year.activeMonth) && year.activeMonth >= 0 && year.activeMonth < 12 ? year.activeMonth : 0 };
    });
    if (!years.length) years.push({ year: String(new Date().getFullYear()), activeMonth: 0, months: MONTHS.map(name => ({ name, paychecks: [], excludedBuckets: [], expenses: [] })) });
    return { ...raw, release2Version: 2, recurring: rb2Array(raw.recurring).map(rb2Row), years, activeYearIndex: Number.isInteger(raw.activeYearIndex) && raw.activeYearIndex >= 0 && raw.activeYearIndex < years.length ? raw.activeYearIndex : 0 };
}
let state = normalizeState({});
let modalSelections = new Set();
function rb2Notice(message) {
    let box = document.getElementById('release2Notice');
    if (!box) { box = document.createElement('aside'); box.id = 'release2Notice'; box.setAttribute('role', 'status'); document.body.prepend(box); }
    box.replaceChildren(document.createTextNode(message));
    const button = document.createElement('button');
    button.textContent = 'Export recovery data';
    button.addEventListener('click', () => {
        try {
            const key = RB2_PREFIX + ':release2:' + (rb2Account == null ? 'guest' : 'account:' + encodeURIComponent(rb2Account));
            const legacy = Object.fromEntries(['_rollover_pro_v5', '_rollover_pro_v4'].map(suffix => [RB2_PREFIX + suffix, localStorage.getItem(RB2_PREFIX + suffix)]));
            const blob = new Blob([JSON.stringify({ current: localStorage.getItem(key), legacy, cloud: rb2CloudRecovery }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'staging-budget-recovery.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { alert('Recovery export failed: ' + error.message); }
    });
    box.append(button);
}
function rb2Month() { const year = state.years[state.activeYearIndex]; return year.months[year.activeMonth]; }
function rb2SetBucket(index, value) {
    const month = rb2Month(); const row = month.expenses[index];
    row.paycheckId = value.startsWith('pay_') && month.paychecks.some(p => p.id === value.slice(4)) ? value.slice(4) : null;
    row.excludedBucketId = value.startsWith('excl_') && month.excludedBuckets.some(b => b.id === value.slice(5)) ? value.slice(5) : null;
    render();
}
async function rb2Activate(id) {
    if (rb2SigningOut && id !== null) return;
    if (id === rb2Account) return;
    rb2Account = id;
    const token = rb2Store.switchAccount(id);
    rb2Blocked = false; rb2Loading = id !== null; rb2CloudRecovery = null;
    state = normalizeState({});
    closeRecurringModal();
    document.getElementById('recSelectList').replaceChildren();
    document.getElementById('modalMonthName').textContent = '';
    updateModalUI();
    document.getElementById('release2Notice')?.remove();
    render();
    const saved = rb2Store.load(normalizeState);
    if (saved.status === 'ok') { state = saved.value; render(); }
    else if (saved.status === 'recovery-required') { rb2Blocked = true; rb2Notice('Saved budget could not be read. Original data is preserved; saving is blocked. Export recovery data before repair.'); return; }
    if (id === null) {
        try { if (['_rollover_pro_v5', '_rollover_pro_v4'].some(suffix => localStorage.getItem(RB2_PREFIX + suffix) !== null)) rb2Notice('Unowned legacy staging data was not loaded into this session. Export it for ownership review and migration.'); } catch { rb2Blocked = true; rb2Notice('Browser storage is unavailable; saving is blocked.'); }
        return;
    }
    setTimeout(() => { if (rb2Store.isCurrent(token)) void window.loadFromCloud(token, id); }, 0);
}
async function rb2SignOut() {
    rb2SigningOut = true;
    await rb2Activate(null);
    try { const result = await supabaseClient?.auth.signOut(); if (result?.error) throw result.error; }
    catch (error) { rb2Notice('Budget cleared from this session, but authentication sign-out failed. Retry sign-out or reload before signing in again.'); }
    renderAuth();
}
function rb2Install() {
    const originalRender = render;
    render = function(isTyping = false) { rb2Revision++; state = normalizeState(state); return originalRender(isTyping); };
    const originalUpdate = window.update;
    window.update = (type, i, key, value, typing = false) => {
        if (type === 'expenses' && key === 'bucketIndex') return rb2SetBucket(i, String(value ?? ''));
        originalUpdate(type, i, key, value, typing);
    };
    window.removeItem = (type, i) => {
        const month = rb2Month();
        if (type === 'paychecks') Object.assign(month, RB2.deleteEntity(month, type, month[type][i].id));
        else if (type === 'expenses') month.expenses.splice(i, 1);
        render();
    };
    window.removeExcluded = i => { const month = rb2Month(); Object.assign(month, RB2.deleteEntity(month, 'excludedBuckets', month.excludedBuckets[i].id)); render(); };
    window.saveData = async () => {
        if (rb2Account === undefined || rb2Blocked || rb2Loading) return alert('Saving blocked until initialization or recovery completes.');
        const token = rb2Store.token(); const account = rb2Account;
        let snapshot;
        try { snapshot = rb2Store.save(state, normalizeState, token); }
        catch (error) { rb2Blocked = true; rb2Notice('Local save failed; cloud was not changed. ' + error.message); return; }
        if (!account || !supabaseClient) return alert('Saved to this guest session only. Guest data is not automatically copied to an account.');
        try {
            const result = await supabaseClient.auth.getUser();
            if (!rb2Store.isCurrent(token)) return;
            if (result.error || result.data?.user?.id !== account) throw new Error('Account changed; cloud save cancelled');
            const { error } = await supabaseClient.from('budget_data').upsert({ user_id: account, state: snapshot, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
            if (!rb2Store.isCurrent(token)) return;
            if (error) throw error;
            alert('Saved locally and synced.');
        } catch (error) { if (rb2Store.isCurrent(token)) alert('Saved locally; cloud save failed: ' + error.message); }
    };
    window.loadFromCloud = async (token = rb2Store.token(), account = rb2Account) => {
        if (!account || !supabaseClient || rb2Blocked) return;
        const revision = rb2Revision;
        rb2Loading = true;
        try {
            const { data, error } = await supabaseClient.from('budget_data').select('state').eq('user_id', account).single();
            if (!rb2Store.isCurrent(token)) return;
            if (error && error.code !== 'PGRST116') throw error;
            if (!data) return;
            if (rb2Revision !== revision) { rb2Blocked = true; rb2Notice('The budget was edited while cloud data was loading. Saving is blocked; export your draft before reloading.'); return; }
            let loaded;
            try { loaded = normalizeState(data.state); }
            catch (error) { rb2CloudRecovery = data.state; rb2Blocked = true; rb2Notice('Cloud budget is invalid or unsupported. Saving is blocked; export recovery data.'); return; }
            rb2Store.save(loaded, normalizeState, token);
            state = loaded; render();
        } catch (error) { if (rb2Store.isCurrent(token)) { rb2Blocked = true; rb2Notice('Cloud load failed; saving is blocked to avoid overwriting an unread budget. ' + error.message); } }
        finally { if (rb2Store.isCurrent(token)) rb2Loading = false; }
    };
    if (!supabaseClient) { void rb2Activate(null); return; }
    supabaseClient.auth.onAuthStateChange((event, session) => {
        const id = session?.user?.id ?? null;
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
            void rb2Activate(id);
        }
    });
}
