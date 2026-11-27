// Advisory only until immutable-diff integration and gate tests are approved.
const presentation = new Set(['styles/brand.css', 'styles/settings.css', 'styles/homepage.css']);
const backup = new Set(['scripts/export-staging-backup.sh']);
export function classifyCiImpact(input = {}) {
  if (!input || input.eventName !== 'pull_request' || input.complete !== true || !Array.isArray(input.files) || !input.files.length) return 'full';
  const seen = new Set();
  let category;
  for (const file of input.files) {
    if (!file || file.status !== 'modified' || file.previous_filename != null || typeof file.filename !== 'string' || seen.has(file.filename)) return 'full';
    seen.add(file.filename);
    const next = presentation.has(file.filename) ? 'presentation' : backup.has(file.filename) ? 'backup' : 'full';
    if (next === 'full' || (category && category !== next)) return 'full';
    category = next;
  }
  return category;
}
