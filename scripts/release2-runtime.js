async function rb2SignOut() {
    rb2SigningOut = true;

    try {
        let cleanupError = null;
        let logoutError = null;

        try {
            // Normal path: invalidate account operations, clear account data,
            // close the recurring modal, and load the separate guest state.
            await rb2Activate(null);
        } catch (error) {
            cleanupError = error;

            // Fail closed if normal cleanup or rendering fails.
            // Do not leave account data accessible through active controls.
            rb2Account = null;
            rb2Store.switchAccount(null);
            rb2Loading = false;
            rb2Blocked = true;
            rb2CloudRecovery = null;

            state = normalizeState({});
            modalSelections.clear();

            // These are the application's main budget, navigation, and modal
            // containers. Keep them hidden until a clean reload.
            for (const selector of [
                '.shell',
                '.bottom-nav',
                '#recurringModal'
            ]) {
                const element = document.querySelector(selector);

                if (element) {
                    element.hidden = true;
                    element.inert = true;
                    element.style.setProperty(
                        'display',
                        'none',
                        'important'
                    );
                }
            }
        } finally {
            // Always attempt authentication logout, regardless of UI errors.
            try {
                if (!supabaseClient) {
                    throw new Error('Authentication client unavailable');
                }

                const { error } = await supabaseClient.auth.signOut();

                if (error) {
                    throw error;
                }
            } catch (error) {
                logoutError = error;
            }
        }

        if (cleanupError) {
            rb2Notice(
                logoutError
                    ? 'The budget interface was disabled after a cleanup error. ' +
                      'Authentication sign-out also failed. Reload and retry ' +
                      'sign-out before using this browser again.'
                    : 'You have been signed out. The budget interface was ' +
                      'disabled after a cleanup error. Reload to continue.'
            );

            return;
        }

        if (logoutError) {
            rb2Notice(
                'Account budget data was cleared from this view, but ' +
                'authentication sign-out failed. Retry sign-out or reload ' +
                'before signing in again.'
            );
        }

        await renderAuth();
    } finally {
        rb2SigningOut = false;
    }
}
