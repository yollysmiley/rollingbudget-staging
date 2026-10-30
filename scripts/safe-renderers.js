function rbEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text ?? '');
    return el;
}
function rbButton(action) {
    const el = rbEl('button', 'btn-outline btn-remove', '✕');
    el.append(rbEl('span', 'remove-text', ' Remove'));
    el.addEventListener('click', action);
    return el;
}
function rbField(label, control) {
    const el = rbEl('div', 'field');
    el.append(rbEl('label', '', label), control);
    return el;
}
function rbInput(value, type, event, action) {
    const el = rbEl('input');
    el.type = type;
    el.value = String(value ?? '');
    el.addEventListener(event, () => action(el.value));
    return el;
}
function rbOption(value, text, selected) {
    const el = rbEl('option', '', text);
    el.value = String(value);
    el.selected = Boolean(selected);
    return el;
}
function rbDay(selected, action) {
    const el = rbEl('select', 'field-select');
    el.append(rbOption('', '— Day —', !selected));
    for (let day = 1; day <= 31; day++) el.append(rbOption(day, ordinal(day), Number(selected) === day));
    el.addEventListener('change', () => action(el.value ? Number(el.value) : null));
    return el;
}
function rbNote(text) {
    const el = rbEl('p', '', text);
    el.style.color = 'var(--muted)';
    el.style.fontSize = '0.9rem';
    return el;
}
function rbSummaryPart(label, cls, value) {
    const el = rbEl('span', '', label);
    el.append(rbEl('span', cls, money(value)));
    return el;
}
function rbAvatarUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) return null;
        return url.href;
    } catch { return null; }
}
function rbAvatar(user, mobile) {
    const url = rbAvatarUrl(user.user_metadata?.avatar_url);
    if (!url) return rbEl('span', 'avatar-fallback', '👤');
    const img = rbEl('img');
    img.alt = 'User avatar';
    img.width = img.height = mobile ? 28 : 24;
    img.style.borderRadius = '50%';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(rbEl('span', 'avatar-fallback', '👤')), { once: true });
    img.src = url;
    return img;
}
let rbAuthGeneration = 0;
async function renderAuth() {
    const generation = ++rbAuthGeneration;
    let user = null;
    try {
        if (supabaseClient) {
            const result = await supabaseClient.auth.getUser();
            if (!result.error) user = result.data?.user ?? null;
        }
    } catch (error) { console.error('Auth display failed', error); }
    if (generation !== rbAuthGeneration) return;
    for (const id of ['authContainer', 'authContainerMobile']) {
        const container = document.getElementById(id);
        if (!container) continue;
        const mobile = id === 'authContainerMobile';
        container.replaceChildren();
        if (user) {
            if (mobile) container.append(rbAvatar(user, true));
            else {
                const pill = rbEl('div', 'user-pill');
                pill.append(rbAvatar(user, false), rbEl('span', '', user.user_metadata?.full_name || user.email || 'Signed in'));
                const logout = rbEl('button', 'btn-ghost', 'Sign Out');
                logout.addEventListener('click', signOut);
                container.append(pill, logout);
            }
        } else {
            const login = rbEl('button', 'btn-github', mobile ? '⬥ Login' : 'GitHub Login');
            login.addEventListener('click', signInWithGitHub);
            container.append(login);
        }
    }
}
function rbNavigation(activeYear) {
    document.getElementById('monthList').replaceChildren(...activeYear.months.map((month, i) => {
        const chip = rbEl('div', 'month-item' + (i === activeYear.activeMonth ? ' active' : ''));
        const name = String(month.name ?? '');
        chip.append(rbEl('strong', 'month-full', name), rbEl('strong', 'month-short', name.slice(0, 3)), rbEl('small', 'month-balance', ' · ' + money(month.endRollover)));
        chip.addEventListener('click', () => setActive(i));
        return chip;
    }));
    document.getElementById('yearSelector').replaceChildren(...state.years.map((year, i) => rbOption(i, year.year, i === state.activeYearIndex)));
}
function rbOpenRecurringModal() {
    const activeYear = state.years[state.activeYearIndex];
    document.getElementById('modalMonthName').textContent = activeYear.months[activeYear.activeMonth].name;
    modalSelections.clear();
    const list = document.getElementById('recSelectList');
    list.replaceChildren();
    document.getElementById('modalToolbar').style.display = state.recurring.length ? 'flex' : 'none';
    if (!state.recurring.length) list.append(rbEl('div', 'empty-rec-note', 'No global recurring bills set up yet. Go to the Recurring tab to add some.'));
    state.recurring.forEach((item, i) => {
        const row = rbEl('div', 'rec-select-item');
        row.dataset.idx = String(i);
        row.addEventListener('click', () => toggleRecurringItem(i));
        const checkbox = rbEl('input');
        checkbox.type = 'checkbox';
        checkbox.addEventListener('click', event => { event.stopPropagation(); toggleRecurringItem(i); });
        const info = rbEl('div', 'rec-select-item-info');
        info.append(rbEl('span', 'rec-select-item-name', item.name || 'Unnamed'), rbEl('span', 'rec-select-item-meta', (item.category || 'No category') + (item.dueDay ? ' · Due ' + ordinal(item.dueDay) : '')));
        row.append(checkbox, info, rbEl('span', 'rec-select-item-amount', money(item.amount) + '/mo'));
        list.append(row);
    });
    updateModalUI();
    document.getElementById('recurringModal').classList.add('open');
}
function renderPaychecks(data) {
    const nodes = [];
    data.forEach((item, i) => {
        const row = rbEl('div', 'row row-paycheck');
        const running = rbEl('div', 'running-bal', money(item.balanceAfter));
        running.id = 'running-bal-' + i;
        row.append(rbField('Label', rbInput(item.name, 'text', 'change', value => update('paychecks', i, 'name', value))), rbField('Date', rbInput(item.date, 'date', 'change', value => update('paychecks', i, 'date', value))), rbField('Amount', rbInput(item.amount, 'number', 'input', value => update('paychecks', i, 'amount', value, true))), rbField('Running', running), rbButton(() => removeItem('paychecks', i)));
        const summary = rbEl('div', 'bucket-summary');
        summary.id = 'bucket-summary-' + i;
        const title = rbEl('span', '', '💼 ');
        title.append(rbEl('strong', '', item.name || 'Paycheck ' + (i + 1)));
        summary.append(title, rbSummaryPart('Assigned: ', 'bs-assigned', item.bucketExpenses), rbSummaryPart('Balance: ', 'bs-remaining', item.balanceAfter));
        nodes.push(row, summary);
    });
    document.getElementById('paycheckContainer').replaceChildren(...nodes);
}
function renderExcludedBuckets(data) {
    const nodes = [];
    data.forEach((item, i) => {
        const row = rbEl('div', 'row row-excluded');
        row.append(rbField('Bucket Name', rbInput(item.name, 'text', 'change', value => updateExcluded(i, 'name', value))), rbField('Amount', rbInput(item.amount || 0, 'number', 'change', value => updateExcluded(i, 'amount', value))), rbField('Reserve Date', rbInput(item.date, 'date', 'change', value => updateExcluded(i, 'date', value))), rbField('Note', rbInput(item.note, 'text', 'change', value => updateExcluded(i, 'note', value))), rbButton(() => removeExcluded(i)));
        const summary = rbEl('div', 'bucket-spend');
        summary.id = 'excl-bucket-spend-' + i;
        const remaining = item.remaining ?? Number(item.amount || 0);
        const title = rbEl('span', '', '🔒 ');
        title.append(rbEl('strong', '', item.name || 'Bucket ' + (i + 1)));
        summary.append(title, rbSummaryPart('Spent: ', 'bs-spent', item.spent), rbSummaryPart('Remaining: ', 'bs-left' + (remaining < 0 ? ' negative' : ''), remaining));
        nodes.push(row, summary);
    });
    document.getElementById('excludedBucketContainer').replaceChildren(...(nodes.length ? nodes : [rbNote('No excluded buckets yet. Add one above.')]));
}
function renderExpenses(data, paychecks, excludedBuckets) {
    const nodes = data.map((item, i) => {
        const row = rbEl('div', 'row row-expense');
        const name = rbField('Expense', rbInput(item.name, 'text', 'change', value => update('expenses', i, 'name', value)));
        if (item.fromRecurring) name.firstChild.append(rbEl('span', 'rec-badge', '🔄 recurring'));
        const bucket = rbEl('select', 'field-select');
        const selected = item.bucketIndex ?? '';
        bucket.append(rbOption('', '— Unassigned —', selected === ''));
        paychecks.forEach((p, pi) => bucket.append(rbOption(pi, p.name || 'Paycheck ' + (pi + 1), selected === pi)));
        if (excludedBuckets.length) {
            const group = rbEl('optgroup');
            group.label = '🔒 Excluded Buckets';
            excludedBuckets.forEach((b, bi) => group.append(rbOption('excl_' + bi, '🔒 ' + (b.name || 'Bucket ' + (bi + 1)), selected === 'excl_' + bi)));
            bucket.append(group);
        }
        bucket.addEventListener('change', () => update('expenses', i, 'bucketIndex', bucket.value === '' ? null : (isNaN(bucket.value) ? bucket.value : parseInt(bucket.value, 10)), true));
        row.append(name, rbField('Category', rbInput(item.category, 'text', 'change', value => update('expenses', i, 'category', value))), rbField('Amount', rbInput(item.amount, 'number', 'input', value => update('expenses', i, 'amount', value, true))), rbField('Due Day', rbDay(item.dueDay, value => update('expenses', i, 'dueDay', value))), rbField('Bucket 💼', bucket), rbButton(() => removeItem('expenses', i)));
        return row;
    });
    document.getElementById('expenseContainer').replaceChildren(...(nodes.length ? nodes : [rbNote('No expenses yet. Add one above.')]));
}
function renderRecurringList() {
    const nodes = state.recurring.map((item, i) => {
        const row = rbEl('div', 'row row-recurring');
        row.append(rbField('Bill Name', rbInput(item.name, 'text', 'change', value => updateRec(i, 'name', value))), rbField('Category', rbInput(item.category, 'text', 'change', value => updateRec(i, 'category', value))), rbField('Amount', rbInput(item.amount, 'number', 'input', value => updateRec(i, 'amount', value, true))), rbField('Due Day', rbDay(item.dueDay, value => updateRec(i, 'dueDay', value))), rbButton(() => removeRec(i)));
        return row;
    });
    document.getElementById('recurringContainer').replaceChildren(...(nodes.length ? nodes : [rbNote('No recurring bills set up.')]));
}
function renderSummary(activeYear) {
    document.getElementById('summaryBody').replaceChildren(...activeYear.months.map(month => {
        const row = rbEl('tr');
        const name = String(month.name ?? '');
        const cell = rbEl('td', '', name.slice(0, 3));
        cell.append(rbEl('span', 'col-full', name.slice(3)));
        row.append(cell);
        for (const key of ['monthIncome', 'monthExpenses', 'excludedTotal', 'endRollover', 'availableAfterExcluded']) {
            const value = rbEl('td');
            if (key === 'endRollover' || key === 'availableAfterExcluded') value.append(rbEl('strong', '', money(month[key])));
            else value.textContent = money(month[key]);
            row.append(value);
        }
        return row;
    }));
}
