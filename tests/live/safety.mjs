export function requiredSettings(env) {
  const names = ['STAGING_PUBLISHABLE_KEY', 'STAGING_TEST_A_EMAIL', 'STAGING_TEST_A_PASSWORD', 'STAGING_TEST_B_EMAIL', 'STAGING_TEST_B_PASSWORD'];
  if (names.some(name => !env[name])) throw new Error('Missing live-test settings');
  if (!env.STAGING_PUBLISHABLE_KEY.startsWith('sb_publishable_')) throw new Error('Staging publishable key required');
  return Object.fromEntries(names.map(name => [name, env[name]]));
}
export function logoutAccepted(status, body) {
  return status === 200 || status === 204 || ((status === 403 || status === 404) && body?.code === 'session_not_found');
}
export function assertOwnedFixture(row, id, userId, run) {
  if (row.id !== id || row.user_id !== userId || row.state?.integrationRun !== run) throw new Error('Fixture ownership mismatch; refusing cleanup');
}
export async function withDownload(download, action) {
  try { return await action(download); } finally { await download.delete(); }
}
