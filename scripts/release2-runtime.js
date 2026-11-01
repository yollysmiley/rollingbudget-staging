async function rb2Activate(id) {
    if (rb2SigningOut && id !== null) return;
    if (id === rb2Account) return;

    rb2Account = id;
    const token = rb2Store.switchAccount(id);

    rb2Blocked = false;
    rb2Loading = id !== null;
    rb2CloudRecovery = null;

    state = normalizeState({});
    closeRecurringModal();
    document.getElementById('recSelectList')?.replaceChildren();
    document.getElementById('modalMonthName').textContent = '';
    updateModalUI?.();
    document.getElementById('release2Notice')?.remove();
    render();

    const saved = rb2Store.load(normalizeState);
    if (saved.status === 'ok') {
        state = saved.value;
        render();
    } else if (saved.status === 'recovery-required') {
        rb2Blocked = true;
        rb2Notice('Saved budget could not be read. Original data is preserved; saving is blocked. Export recovery data before repair.');
    }

    if (id === null) {
        try {
            if (['_rollover_pro_v5', '_rollover_pro_v4'].some(
                suffix => localStorage.getItem(RB2_PREFIX + suffix) !== null
            )) {
                rb2Notice('Unowned legacy staging data was not loaded into this session. It remains in browser storage for export review.');
            }
        } catch {}
        return;
    }

    setTimeout(() => {
        if (rb2Store.isCurrent(token)) void window.loadFromCloud(token, id);
    }, 0);
}

async function rb2SignOut() {
    rb2SigningOut = true;

    let cleanupError = null;
    let authError = null;

    try {
        await rb2Activate(null);
    } catch (error) {
        cleanupError = error;

        rb2Account = null;
        rb2Store.switchAccount(null);
        rb2Loading = false;
        rb2Blocked = true;
        rb2CloudRecovery = null;

        state = normalizeState({});
        modalSelections.clear();

        for (const selector of ['.shell', '.bottom-nav', '#recurringModal']) {
            const element = document.querySelector(selector);
            if (element) {
                element.hidden = true;
                element.inert = true;
                element.style.setProperty('display', 'none', 'important');
            }
        }
    }

    try {
        if (!supabaseClient) {
            throw new Error('Authentication client unavailable');
        }

        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            throw error;
        }
    } catch (error) {
        authError = error;
    }

    if (cleanupError || authError) {
        rb2Blocked = true;
        rb2Account = null;
        rb2Store.switchAccount(null);
        state = normalizeState({});
        modalSelections.clear();
        rb2Notice('sign-out failed');
        return;
    }

    await renderAuth();
    rb2SigningOut = false;
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    const id = session?.user?.id ?? null;

    if (rb2SigningOut) {
        if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
            return;
        }
    }

    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        void rb2Activate(id);
    }
});
