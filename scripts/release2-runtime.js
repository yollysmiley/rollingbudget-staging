// release2-runtime.js — consolidated Release #2 runtime for the staging build.
//
// This file is injected into the generated app by scripts/integrate-release2.mjs,
// AFTER `const RB2 = (() => { …state module… })();` and `const RB2_PREFIX`. The
// module's helpers are therefore reached through the RB2 namespace. For this file
// to work, integrate-release2.mjs must RETURN them from its IIFE:
//     return { VERSION, normalizeMonth, normalizeState, deleteEntity, createAccountStore };
// (main only returned normalizeMonth/deleteEntity/createAccountStore — add VERSION
// and normalizeState.) release2-state.mjs must also be the PR #9 version, which
// defines normalizeState; main's does not.
//
// Consolidates:
//   - Restores the lifecycle declarations + account-store setup missing on main
//     (issue #7, item 1).
//   - Moves the auth subscription off file-eval scope and INTO rb2Install(), guarded
//     by a null-client check, so a null Supabase client no longer crashes at load
//     (issue #7, items 1 & 4).
//   - PR #9: rb2Notice, rb2DownloadRecovery, rb2ExportRecovery, recovery button.
//   - PR #8: stale-cloud-load guards in rb2Activate, and rb2SigningOut reset on the
//     sign-out error paths.
//   - Logout error path (issue #7): on sign-out FAILURE the account id is kept (not
//     nulled) so a later same-account auth event cannot silently restore its data,
//     the store is pointed at guest so no save can touch the old account, saving is
//     blocked, and the flag is released so the user can still retry or sign in.
//
// NOT here: the date-normalization defect from issue #7 lives in release2-state.mjs
// (normalizeMonth/normalizeState), not in this runtime. See the chat note for that.

const { VERSION, normalizeState, createAccountStore } = RB2;

// --- Lifecycle state (missing on main) ---
let rb2Account = null;       // last activated account id (null = guest)
let rb2Store = null;         // createAccountStore(localStorage, RB2_PREFIX); set up in rb2Install
let rb2SigningOut = false;   // true while a sign-out is in flight
let rb2Blocked = false;      // true when saving must be refused (recovery / sign-out failure)
let rb2Loading = false;      // true while cloud data for an account is being loaded
let rb2CloudRecovery = null; // last malformed cloud payload kept for recovery export
let rb2AuthUnsub = null;     // unsubscribe handle for the auth subscription (set in rb2Install)

function rb2Notice(message) {
  let notice = document.getElementById('release2Notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'release2Notice';
    document.body.prepend(notice);
  }
  notice.textContent = message;
  notice.dataset.message = message;
}

function rb2DownloadRecovery(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget-recovery.json';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function rb2ExportRecovery() {
  const key = `${RB2_PREFIX}:release2:account:${encodeURIComponent(rb2Account ?? 'guest')}`;
  const payload = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    accountId: rb2Account,
    current: rb2Account === null ? null : localStorage.getItem(key),
    draft: {
      schemaVersion: VERSION,
      data: state,
    },
    legacy: {
      [`${RB2_PREFIX}_rollover_pro_v5`]: localStorage.getItem(`${RB2_PREFIX}_rollover_pro_v5`) ?? null,
    },
    cloud: rb2CloudRecovery ?? null,
  };
  rb2DownloadRecovery(payload);
}

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
  const modalMonthName = document.getElementById('modalMonthName');
  if (modalMonthName) modalMonthName.textContent = '';
  updateModalUI?.();
  document.getElementById('release2Notice')?.remove();
  render();

  const saved = rb2Store.load(normalizeState);
  // PR #8: if the active account changed (or a newer activation superseded this
  // token) while we were reading, drop this result — do not paint stale data.
  if (rb2Account !== id || !rb2Store.isCurrent(token)) return;

  if (saved.status === 'ok') {
    state = saved.value;
    render();
  } else if (saved.status === 'recovery-required') {
    rb2Blocked = true;
    rb2Notice('Saved budget could not be read. Original data is preserved; saving is blocked. Export recovery data before repair.');
  }

  if (id === null) return;

  // PR #8: defer the cloud load and re-check account + token before applying, so a
  // stale cloud response cannot overwrite a different account's view.
  setTimeout(() => {
    if (rb2Account !== id) return;
    if (!rb2Store.isCurrent(token)) return;
    void window.loadFromCloud(token, id);
  }, 0);
}

async function rb2SignOut() {
  rb2SigningOut = true;
  // Capture before the guest switch clears it, so a failed sign-out can keep the
  // account id and prevent a later same-account event from silently restoring data.
  const previousAccount = rb2Account;

  // 1. Switch the UI/store to guest first.
  try {
    await rb2Activate(null);
  } catch (error) {
    // Cleanup itself failed: lock down, keep the account id so a later same-account
    // event cannot silently restore data, and point the store at guest so no save can
    // touch the previous account.
    rb2Account = previousAccount;
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
    rb2Notice('sign-out failed');
    rb2SigningOut = false;
    return;
  }

  // 2. Tell Supabase to end the session.
  try {
    if (!supabaseClient) throw new Error('Authentication client unavailable');
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
    // Sign-out failed: the session may still be authenticated. Keep the account id
    // (the subscription's same-account guard then skips any re-activation of it),
    // point the store at guest so saves cannot touch the old account, block saving,
    // and release the flag so the user can retry or sign in as someone else. This is
    // the deliberate path issue #7 asks for instead of a blanket reset.
    rb2Account = previousAccount;
    rb2Store.switchAccount(null);
    rb2Blocked = true;
    state = normalizeState({});
    modalSelections.clear();
    rb2Notice('Sign-out failed. Your session may still be active; saving is blocked. Export recovery data, then retry or sign in again.');
    rb2SigningOut = false;
    return;
  }

  // 3. Success: UI is already guest; refresh the auth chrome and release the flag.
  await renderAuth();
  rb2SigningOut = false;
}

function rb2Install() {
  // Set up the account store once. createAccountStore enforces the staging storage
  // prefix, so this can only touch staging-scoped keys.
  if (!rb2Store) rb2Store = createAccountStore(localStorage, RB2_PREFIX);

  // Install the auth subscription here (not at file-eval time) and only when a
  // client exists. A null client (e.g. the state-test harness) no longer crashes.
  if (supabaseClient && !rb2AuthUnsub) {
    rb2AuthUnsub = supabaseClient.auth.onAuthStateChange((event, session) => {
      const id = session?.user?.id ?? null;

      // PR #8: while we are signing out, ignore the expected sign-out/user events.
      if (rb2SigningOut && (event === 'SIGNED_OUT' || event === 'USER_UPDATED')) return;
      // Skip redundant re-activation of the account that is already active.
      if (event !== 'INITIAL_SESSION' && id === rb2Account && id !== null) return;

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        void rb2Activate(id);
      }
    });
  }

  // Recovery export entry point (PR #9).
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Export recovery data';
  button.addEventListener('click', () => { rb2ExportRecovery(); });

  const container = document.createElement('div');
  container.append(button);
  document.body.append(container);

  window.rb2ExportRecovery = rb2ExportRecovery;
  window.rb2Notice = rb2Notice;
}
