import { expect } from '@playwright/test';

// Start with the browser fixture's empty accounts and explicitly add both owners'
// test records. Hold only the second owner's catalog read after its year arrives.
export async function switchWhileAccountCatalogLoads(page) {
  await page.evaluate(async () => {
    db[activeYear].months[0].income.push({
      name: 'FIRST OWNER INCOME', amount: 500, accountId: null
    });
    await saveDB();
    render();
    const ownerB = 'browser-test-other-owner';
    const year = activeYear;
    const next = structuredClone(db[year]);
    for (const month of next.months) {
      for (const type of ['income', 'fixed', 'variable', 'creditCards', 'loans']) {
        month[type] = [];
      }
    }
    next.months[0].income.push({ name: 'SECOND OWNER INCOME', amount: 250, accountId: 'checking-b' });
    sessionStorage.setItem('__mock_cloud_budget_rows', JSON.stringify({
      [year]: { year: Number(year), budget_data: next, updated_at: '2026-11-16T00:00:00.000Z' }
    }));
    sessionStorage.setItem('__mock_account_rows', JSON.stringify([{
      id: 'checking-b', user_id: ownerB, name: 'Checking B', included: true,
      updated_at: '2026-11-16T00:00:00.000Z'
    }]));
    const originalFrom = supabaseClient.from.bind(supabaseClient);
    supabaseClient.from = table => {
      const query = originalFrom(table);
      if (table !== 'budget_accounts') return query;
      const originalSelect = query.select.bind(query);
      query.select = (...args) => {
        const selected = originalSelect(...args);
        const originalEq = selected.eq.bind(selected);
        selected.eq = (...args) => {
          const result = originalEq(...args);
          return new Promise(resolve => {
            window.__releaseAccountCatalog = () => Promise.resolve(result).then(resolve);
          });
        };
        return selected;
      };
      return query;
    };
    window.__mockSwitchAuthUser({ id: ownerB, email: 'owner-b@example.invalid' });
  });
  await expect.poll(() => page.evaluate(() => Boolean(window.__releaseAccountCatalog))).toBe(true);
  const pending = await page.evaluate(() => {
    // Reproduce the former live-test race: the year arrives before its catalog.
    selectMonth(0);
    render();
    return {
      owner: currentUser?.id,
      ready: accountReadyOwner,
      catalog: budgetAccounts.length,
      gated: !document.documentElement.classList.contains('budget-authenticated'),
      loadedYear: db[activeYear]?.months?.[0]?.income?.[0]?.name
    };
  });
  expect(pending).toEqual({
    owner: 'browser-test-other-owner',
    ready: null,
    catalog: 0,
    gated: true,
    loadedYear: 'SECOND OWNER INCOME'
  });
  await page.evaluate(() => window.__releaseAccountCatalog());
  await expect(page.locator('html')).toHaveClass(/budget-authenticated/);
  await expect.poll(() => page.evaluate(() => ({
    owner: currentUser?.id, ready: accountReadyOwner,
    accounts: budgetAccounts.map(account => account.id)
  }))).toEqual({
    owner: 'browser-test-other-owner',
    ready: 'browser-test-other-owner',
    accounts: ['checking-b']
  });
}
