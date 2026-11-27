import { test, expect } from '@playwright/test';
import { mockSignedInBudget, expectAuthenticatedBudget } from './auth-fixture.js';

export function sharedCloudBrowserContract(viewSelector) {
  test('independent browser contexts share cloud revisions without sharing local storage', async ({ browser, page }) => {
    const rows = new Map();
    const cloud = ({ operation, filters, payload, owner }) => {
      const key = JSON.stringify([owner, Number(filters.year ?? payload?.year)]);
      if (!owner || (filters.user_id && filters.user_id !== owner) ||
          (payload?.user_id && payload.user_id !== owner)) return { data: [], error: null };
      if (operation === 'read') return { data: [...rows.values()].filter(row =>
        row.user_id === owner && (filters.year === undefined || row.year === Number(filters.year))), error: null };
      if (operation === 'insert') {
        if (rows.has(key)) return { error: { code: '23505' } };
        rows.set(key, structuredClone(payload));
        return { error: null };
      }
      const row = rows.get(key);
      if (!row || row.updated_at !== filters.updated_at) return { data: [], error: null };
      rows.set(key, { ...row, ...structuredClone(payload) });
      return { data: [{ year: row.year }], error: null };
    };
    const second = await browser.newContext({ viewport: page.viewportSize() });
    try {
      const other = await second.newPage();
      for (const target of [page, other]) {
        await mockSignedInBudget(target, { sharedCloud: cloud });
        await target.route('https://**/rest/v1/**', route => route.abort());
        await target.route('https://**/auth/v1/**', route => route.abort());
        await target.goto('/app/');
        await expectAuthenticatedBudget(target);
        await expect(target.locator(viewSelector)).toBeVisible();
        await expect(target.locator('#rollingStrip .month-pill')).toHaveCount(12);
      }
      const revision = '2026-01-01T00:00:00.000Z';
      const owner = 'browser-test-owner';
      const year = 2099;
      const inserted = await page.evaluate(async row => window.__sharedBudgetCloud({
        operation: 'insert', owner: row.user_id, filters: {}, payload: row
      }), { user_id: owner, year, updated_at: revision, budget_data: { months: [] } });
      expect(inserted.error).toBeNull();
      const observed = await other.evaluate(async ({ owner, year }) => window.__sharedBudgetCloud({
        operation: 'read', owner, filters: { user_id: owner, year }
      }), { owner, year });
      expect(observed.data[0].updated_at).toBe(revision);
      await page.evaluate(() => localStorage.setItem('__cloud_fixture_isolation', 'first'));
      expect(await other.evaluate(() => localStorage.getItem('__cloud_fixture_isolation'))).toBeNull();
    } finally {
      await second.close();
    }
  });
}
