import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('approved brand and responsive navigation are shared without changing budget storage', () => {
  const css = file('../styles/brand.css');
  const app = file('../rollover-budget-app.html');
  const home = file('../index.html');
  assert.match(css, /--rb-header:\s*#17152B/i);
  assert.match(css, /--rb-logo:\s*#8B7CFF/i);
  assert.match(css, /--rb-logo-highlight:\s*#B1A6FF/i);
  assert.match(css, /\.desktop-primary-nav/);
  assert.match(css, /@media\(max-width:768px\)/);
  assert.match(app, /href="styles\/brand.css"/);
  assert.match(home, /href="styles\/brand.css"/);
  assert.match(app, /function storageKey\(year\)/);
});
test('staging build publishes brand stylesheet to public and authenticated routes', () => {
  const build = file('../scripts/build-staging.mjs');
  assert.match(build, /dist\/styles\/brand.css/);
  assert.match(build, /dist\/app\/styles\/brand.css/);
});
