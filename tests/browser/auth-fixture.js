import { expect } from '@playwright/test';

// Browser-only Supabase client double. Production code still verifies auth.getUser().
export async function mockSignedInBudget(page) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `
      window.supabase = { createClient() {
        const user = { id: 'browser-test-owner', email: 'browser-test@example.invalid' };
        let listener;
        const activeUser = () => sessionStorage.getItem('__mock_signed_out') === '1' ? null : user;
        return {
          auth: {
            async getUser() { return { data: { user: activeUser() }, error: null }; },
            async getSession() { return { data: { session: activeUser() ? { user: activeUser() } : null }, error: null }; },
            onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
            async signOut() { sessionStorage.setItem('__mock_signed_out', '1'); if (listener) listener('SIGNED_OUT', null); return { error: null }; }
          },
          from(table) {
            const chain = {
              select() { return chain; },
              eq() {
                const accountRows = table === 'budget_accounts' && sessionStorage.getItem('__mock_legacy_accounts') === '1'
                  ? [{ id: 'cpm', name: 'CPM Federal', included: true }, { id: 'usaa', name: 'USAA', included: true }] : [];
                const recurringRows = table === 'budget_recurring_rules'
                  ? JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]') : [];
                return Promise.resolve({ data: table === 'budget_recurring_rules' ? recurringRows : accountRows, error: null });
              },
              upsert() { return Promise.resolve({ data: [], error: table === 'budget_ui_years' && sessionStorage.getItem('__mock_budget_cloud_failure') === '1' ? { message: 'offline' } : null }); }
            };
            return chain;
          }
        };
      } };
    `
  }));
}
export async function expectAuthenticatedBudget(page) {
  await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
}
