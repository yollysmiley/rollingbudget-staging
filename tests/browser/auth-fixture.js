import { expect } from '@playwright/test';

// Browser-only Supabase client double. Production code still verifies auth.getUser().
export async function mockSignedInBudget(page) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `
      window.supabase = { createClient() {
        const user = { id: 'browser-test-owner', email: 'browser-test@example.invalid' };
        let listener;
        return {
          auth: {
            async getUser() { return { data: { user }, error: null }; },
            async getSession() { return { data: { session: { user } }, error: null }; },
            onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
            async signOut() { if (listener) listener('SIGNED_OUT', null); return { error: null }; }
          },
          from() {
            const chain = {
              select() { return chain; }, eq() { return Promise.resolve({ data: [], error: null }); },
              upsert() { return Promise.resolve({ data: [], error: null }); }
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
