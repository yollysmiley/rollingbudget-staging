// Shared optimistic-concurrency contract for owner-scoped budget-year writes.
export function nextBudgetRevision(requestedAt, knownRevision = null) {
  const requested = Date.parse(requestedAt);
  const previous = knownRevision === null ? NaN : Date.parse(knownRevision);
  if (!Number.isFinite(requested) || (knownRevision !== null && !Number.isFinite(previous))) {
    throw new Error('Budget revision timestamp is invalid');
  }
  return new Date(Math.max(requested, Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
}

export async function writeBudgetRevision(client, { owner, year, document, knownRevision = null, requestedAt }) {
  if (!owner || !Number.isInteger(Number(year)) || !document) throw new Error('Budget write scope is invalid');
  const updatedAt = nextBudgetRevision(requestedAt, knownRevision);
  if (knownRevision !== null) {
    const { data, error } = await client.from('budget_ui_years')
      .update({ budget_data: document, updated_at: updatedAt })
      .eq('user_id', owner).eq('year', Number(year))
      .eq('updated_at', knownRevision).select('year');
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error('Budget changed on another device; reload before saving');
    }
    return { updatedAt, inserted: false };
  }
  // The database's unique (user_id, year) constraint rejects concurrent first inserts.
  const { error } = await client.from('budget_ui_years').insert({
    user_id: owner, year: Number(year), budget_data: document, updated_at: updatedAt
  });
  if (error) throw error;
  return { updatedAt, inserted: true };
}
