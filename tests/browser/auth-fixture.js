import { expect } from '@playwright/test';

// Browser-only Supabase client double. Production code still verifies auth.getUser().
export async function mockSignedInBudget(page) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `
      window.supabase = { createClient() {
        let user = { id: 'browser-test-owner', email: 'browser-test@example.invalid' };
        let listener;
        const activeUser = () => sessionStorage.getItem('__mock_signed_out') === '1' ? null : user;
        // Exercise the same authenticated switch callback as the real Supabase SDK.
        window.__mockSwitchAuthUser = next => {
          user = { ...next };
          if (listener) listener('SIGNED_IN', { user });
        };
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
                  // Cloud rows exist only after an explicit insert/update in this isolated test.
                  const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}');
                  if (field === 'user_id') return {
                    eq(yearField, year) {
                      if (value !== user.id || yearField !== 'year') {
                        return Promise.resolve({ data: [], error: null });
                      }
                      const key = String(year);
                      return Promise.resolve({ data: rows[key] ? [rows[key]] : [], error: null });
                    },
                    // Supabase queries are thenable both with and without a year filter.
                    then(resolve, reject) {
                      const failure = sessionStorage.getItem('__mock_budget_cloud_discovery_failure') === '1';
                      return Promise.resolve(failure
                        ? { data: null, error: { message: 'discovery offline' } }
                        : { data: value === user.id ? Object.values(rows) : [], error: null }
                      ).then(resolve, reject);
                    }
                  };
                  return Promise.resolve({ data: Object.values(rows), error: null });
                }

                const accountRows = table !== 'budget_accounts' ? [] :
                  sessionStorage.getItem('__mock_account_rows') !== null
                    ? JSON.parse(sessionStorage.getItem('__mock_account_rows'))
                    : sessionStorage.getItem('__mock_legacy_accounts') === '1'
                      ? [{ id: 'cpm', name: 'CPM Federal', included: true }, { id: 'usaa', name: 'USAA', included: true }] : [];
                const recurringRows = table === 'budget_recurring_rules'
                  ? JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]') : [];
                if (table === 'budget_recurring_rules') {
                  const filters = {};
                  const query = {
                    eq(field, value) { filters[field] = value; return query; },
                    then(resolve, reject) {
                      const scoped = recurringRows.filter(row => row.user_id === user.id &&
                        Object.entries(filters).every(([field, value]) => row[field] === value));
                      return Promise.resolve({ data: scoped, error: null }).then(resolve, reject);
                    }
                  };
                  return query;
                }
                if (table === 'budget_accounts') {
                  const scoped = field === 'user_id' && value === user.id
                    ? accountRows.filter(row => !row.user_id || row.user_id === user.id) : [];
                  const result = Promise.resolve({ data: scoped, error: null });
                  result.eq = (key, expected) => Promise.resolve({
                    data: scoped.filter(row => row[key] === expected), error: null
                  });
                  return result;
                }
                return Promise.resolve({ data: accountRows, error: null });
              },
              insert(row) {
                if (table === 'budget_accounts') {
                  if (row.user_id !== user.id) return Promise.resolve({ error: { message: 'forbidden' } });
                  const rows = JSON.parse(sessionStorage.getItem('__mock_account_rows') || '[]');
                  if (rows.some(item => item.user_id === row.user_id && (item.id === row.id || item.name.toLowerCase() === row.name.toLowerCase()))) {
                    return Promise.resolve({ error: { message: 'duplicate account' } });
                  }
                  rows.push({ ...row, updated_at: new Date().toISOString() });
                  sessionStorage.setItem('__mock_account_rows', JSON.stringify(rows));
                }
                if (table === 'budget_ui_years') {
                  if (row.user_id !== user.id) return Promise.resolve({ error: { message: 'forbidden' } });
                  const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}');
                  if (sessionStorage.getItem('__mock_budget_cloud_failure') === '1') return Promise.resolve({ error: { message: 'offline' } });
                  if (rows[String(row.year)]) return Promise.resolve({ error: { message: 'duplicate key' } });
                  rows[String(row.year)] = { year: row.year, budget_data: structuredClone(row.budget_data), updated_at: row.updated_at };
                  sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
                }
                if (table === 'budget_recurring_rules') {
                  const rows = JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]');
                  rows.push(row);
                  sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify(rows));
                }
                return Promise.resolve({ data: [row], error: null });
              },
              update(changes) {
                if (table === 'budget_accounts') {
                  const filters = {};
                  const query = {
                    eq(field, value) { filters[field] = value; return query; },
                    select() {
                      const rows = JSON.parse(sessionStorage.getItem('__mock_account_rows') || '[]');
                      const found = rows.filter(row => filters.user_id === user.id &&
                        Object.entries(filters).every(([field, value]) => row[field] === value));
                      for (const row of found) Object.assign(row, changes);
                      sessionStorage.setItem('__mock_account_rows', JSON.stringify(rows));
                      return Promise.resolve({ data: found.map(row => ({ id: row.id })), error: null });
                    }
                  };
                  return query;
                }
                if (table === 'budget_ui_years') {
                  const filters = {};
                  const query = {
                    eq(field, value) { filters[field] = value; return query; },
                    select() {
                      if (sessionStorage.getItem('__mock_budget_cloud_failure') === '1' ||
                          sessionStorage.getItem('__mock_budget_cloud_update_failure') === '1') {
                        return Promise.resolve({ data: null, error: { message: 'offline' } });
                      }
                      const rows = JSON.parse(sessionStorage.getItem('__mock_cloud_budget_rows') || '{}');
                      const key = String(filters.year), row = rows[key];
                      if (filters.user_id !== user.id || !row || row.updated_at !== filters.updated_at) return Promise.resolve({ data: [], error: null });
                      rows[key] = { ...row, ...changes };
                      sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify(rows));
                      return Promise.resolve({ data: [{ year: Number(key) }], error: null });
                    }
                  };
                  return query;
                }
                const filters = {};
                const query = {
                  eq(field, value) { filters[field] = value; return query; },
                  select() {
                    const rows = JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]');
                    const matching = rows.filter(row => row.user_id === filters.user_id &&
                      row.user_id === user.id && row.id === filters.id &&
                      JSON.stringify(row.versions) === filters.versions);
                    sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify(rows.map(row =>
                      matching.includes(row) ? { ...row, ...changes } : row)));
                    return Promise.resolve({ data: matching.map(row => ({ id: row.id })), error: null });
                  }
                };
                return query;
              },
              delete() {
                if (table === 'budget_accounts') {
                  const filters = {};
                  const query = {
                    eq(field, value) { filters[field] = value; return query; },
                    select() {
                      const rows = JSON.parse(sessionStorage.getItem('__mock_account_rows') || '[]');
                      const found = rows.filter(row => filters.user_id === user.id &&
                        Object.entries(filters).every(([field, value]) => row[field] === value));
                      sessionStorage.setItem('__mock_account_rows', JSON.stringify(rows.filter(row => !found.includes(row))));
                      return Promise.resolve({ data: found.map(row => ({ id: row.id })), error: null });
                    }
                  };
                  return query;
                }
                const filters = {};
                const chain = {
                  eq(field, value) { filters[field] = value; return chain; },
                  select() {
                    const rows = JSON.parse(sessionStorage.getItem('__mock_recurring_preview_rules') || '[]');
                    const matched = rows.filter(row => row.user_id === user.id &&
                      row.user_id === filters.user_id && row.id === filters.id &&
                      JSON.stringify(row.versions) === filters.versions);
                    sessionStorage.setItem('__mock_recurring_preview_rules', JSON.stringify(
                      rows.filter(row => !matched.includes(row))));
                    return Promise.resolve({ data: matched.map(row => ({ id: row.id })), error: null });
                  }
                };
                return chain;
              },
              upsert(row) {
                if (table === 'budget_accounts') {
                  const rows = JSON.parse(sessionStorage.getItem('__mock_account_rows') || '[]');
                  for (const item of Array.isArray(row) ? row : [row]) {
                    if (item.user_id !== user.id) return Promise.resolve({ error: { message: 'forbidden' } });
                    if (!rows.some(existing => existing.user_id === item.user_id && existing.id === item.id)) {
                      rows.push({ ...item, updated_at: new Date().toISOString() });
                    }
                  }
                  sessionStorage.setItem('__mock_account_rows', JSON.stringify(rows));
                }
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
