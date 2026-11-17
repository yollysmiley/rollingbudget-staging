// Deterministic, account-isolated browser fixture for active cloud reconciliation.
// Start with the signed-in mock's empty budget and create explicit records.
export async function holdCloudReconciliation(page) {
  await page.evaluate(async () => {
    selectMonth(0);
    const year = activeYear, owner = currentUser.id;
    db[year].months[0].variable.push({ name: 'Protected expense', amount: 25, dueDay: 11, accountId: null });
    await saveDB();
    render();
    markCloudConflict(owner + ':' + year, year);
    const originalFrom = supabaseClient.from.bind(supabaseClient);
    const originalConfirm = window.confirm;
    let releaseRead = null;
    supabaseClient.from = table => {
      const query = originalFrom(table);
      if (table !== 'budget_ui_years') return query;
      const originalSelect = query.select.bind(query);
      query.select = (...args) => {
        const selected = originalSelect(...args);
        const originalEq = selected.eq.bind(selected);
        selected.eq = (field, value) => {
          const scoped = originalEq(field, value);
          const originalYearEq = scoped.eq.bind(scoped);
          scoped.eq = (yearField, number) => new Promise(resolve => {
            releaseRead = () => Promise.resolve(originalYearEq(yearField, number)).then(resolve);
          });
          return scoped;
        };
        return selected;
      };
      return query;
    };
    window.confirm = () => true;
    const pending = reconcileCloudBudget(false);
    for (let i = 0; i < 50 && !releaseRead; i++) await new Promise(resolve => setTimeout(resolve, 0));
    if (!releaseRead || !reconcilingBudgetYears.has(owner + ':' + year)) {
      throw new Error('Reconciliation was not held before cloud read');
    }
    window.__finishHeldReconciliation = async () => {
      try {
        releaseRead();
        await pending;
      } finally {
        supabaseClient.from = originalFrom;
        window.confirm = originalConfirm;
        delete window.__finishHeldReconciliation;
      }
    };
  });
}

export async function finishHeldReconciliation(page) {
  await page.evaluate(() => window.__finishHeldReconciliation());
}
