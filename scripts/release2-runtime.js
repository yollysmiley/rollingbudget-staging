async function rb2Activate(id) {
    // Always allow the next activation to replace the previous lifecycle state.
    rb2SigningOut = false;

    // If we're already on the same active account and the state is settled, do nothing.
    if (id === rb2Account && !rb2Blocked && !rb2Loading) return;

    rb2Account = id;
    const token = rb2Store.switchAccount(id);

    rb2Blocked = false;
    rb2Loading = id !== null;
    rb2CloudRecovery = null;

    state = normalizeState({});
    modalSelections.clear();
    closeRecurringModal();

    const list = document.getElementById('recSelectList');
    if (list) list.replaceChildren();

    const modalMonthName = document.getElementById('modalMonthName');
    if (modalMonthName) modalMonthName.textContent = '';

    updateModalUI?.();
    document.getElementById('release2Notice')?.remove();

    render();

    if (id === null) {
        // Guest/session reset path. Do not leave prior account state in the active UI.
        return;
    }

    const saved = rb2Store.load(normalizeState);
    if (saved.status === 'ok') {
        state = saved.value;
        render();
    } else if (saved.status === 'recovery-required') {
        rb2Blocked = true;
        rb2Notice(
            'Saved budget could not be read. Original data is preserved; saving is blocked. ' +
            'Export recovery data before repair.'
        );
    }
}

async function rb2SignOut() {
    rb2SigningOut = true;

    try {
        let cleanupError = null;
        let logoutError = null;

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
        } finally {
            try {
                if (!supabaseClient) {
                    throw new Error('Authentication client unavailable');
                }
                const { error } = await supabaseClient.auth.signOut();
                if (error) throw error;
            } catch (error) {
                logoutError = error;
            }
        }

        if (cleanupError) {
            rb2Notice(
                logoutError
                    ? 'The budget interface was disabled after a cleanup error. Authentication sign-out also failed. Reload and retry sign-out before using this browser again.'
                    : 'You have been signed out. The budget interface was disabled after a cleanup error. Reload to continue.'
            );
            return;
        }

        if (logoutError) {
            rb2Notice(
                'Account budget data was cleared from this view, but authentication sign-out failed. Retry sign-out or reload before signing in again.'
            );
        }

        await renderAuth();
    } finally {
        rb2SigningOut = false;
        rb2Blocked = false;
        rb2Loading = false;
    }
}
