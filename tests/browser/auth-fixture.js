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
              eq(field, value) {
                if (table === 'budget_ui_years') {
                  // Seed only from the current isolated test account's in-memory budget.
                  const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}');
                  if (field === 'user_id') return {
                    eq(yearField, year) {
                      const key = String(year);
                      if (!rows[key] && typeof db !== 'undefined' && db[key]) {
                        rows[key] = { year: Number(year), budget_data: structuredClone(db[key]), updated_at: '2026-01-01T00:00:00.000Z' };
                        sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
                      }
                      return Promise.resolve({ data: rows[key] ? [rows[key]] : [], error: null });
                    }
                  };
                  return Promise.resolve({ data: Object.values(rows), error: null });
                }

                const accountRows = table === 'budget_accounts' && sessionStorage.getItem('__mock_legacy_accounts') === '1'
                  ? [{ id: 'cpm', name: 'CPM Federal', included: true }, { id: 'usaa', name: 'USAA', included: true }] : [];
                const recurringRows = table === 'budget_recurring_rules'
                  ? JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]') : [];
                if (table === 'budget_recurring_rules') {
                  const result = Promise.resolve({ data: recurringRows, error: null });
                  result.eq = (_field, id) => Promise.resolve({ data: recurringRows.filter(row => row.id === id), error: null });
                  return result;
                }
                return Promise.resolve({ data: accountRows, error: null });
              },
              insert(row) {
                if (table === 'budget_recurring_rules') {
                  const rows = JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]');
                  rows.push(row);
                  sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify(rows));
                }
                return Promise.resolve({ data: [row], error: null });
              },
              update(changes) {
                if (table === 'budget_ui_years') {
                  const filters = {};
                  const query = {
                    eq(field, value) { filters[field] = value; return query; },
                    select() {
                      if (sessionStorage.getItem('__mock_budget_cloud_failure') === '1') return Promise.resolve({ data: null, error: { message: 'offline' } });
                      const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}');
                      const key = String(filters.year), row = rows[key];
                      if (!row || row.updated_at !== filters.updated_at) return Promise.resolve({ data: [], error: null });
                      rows[key] = { ...row, ...changes };
                      sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
                      return Promise.resolve({ data: [{ year: Number(key) }], error: null });
                    }
                  };
                  return query;
                }
                return { eq() { return { eq(_field, id) {
                  const rows = JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]');
                  sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify(rows.map(row => row.id === id ? { ...row, ...changes } : row)));
                  return Promise.resolve({ error: null });
                } }; } };
              },
              delete() {
                return { eq() { return { eq(_field, id) {
                  const rows = JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]');
                  sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify(rows.filter(row => row.id !== id)));
                  return Promise.resolve({ error: null });
                } }; } };
              },
              upsert(row) {
                if (table === 'budget_ui_years' && sessionStorage.getItem('__mock_budget_cloud_failure') !== '1') {
                  const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}');
                  rows[String(row.year)] = { year: row.year, budget_data: structuredClone(row.budget_data), updated_at: row.updated_at };
                  sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
                }
                return Promise.resolve({ data: [], error: table === 'budget_ui_years' && sessionStorage.getItem('__mock_budget_cloud_failure') === '1' ? { message: 'offline' } : null });
              }
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
