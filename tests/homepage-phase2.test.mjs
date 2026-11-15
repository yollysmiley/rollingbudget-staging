import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build-staging.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/homepage.css', import.meta.url), 'utf8');

test('marketing homepage retains the approved reference copy and split illustration', () => {
  assert.match(home, /Make room for what matters, one month at a time/);
  assert.match(home, /class="public-hero"/);
  assert.match(home, /class="budget-scene"/);
  assert.match(home, /aria-label="Core Features"/);
  assert.match(home, /href="app\/\?auth=signup"/);
  assert.match(home, /href="app\/\?auth=signin"/);
});

test('authentication remains modal and does not expose the budget on the public homepage', () => {
  for (const id of ['accountDialog','accountForm','accountEmail','accountPassword','accountForgot','accountModeSwitch']) {
    assert.match(home, new RegExp('id="' + id + '"'));
  }
  assert.match(home, /resetPasswordForEmail/);
  assert.match(home, /signInWithPassword/);
  assert.match(home, /auth\.signUp/);
  assert.match(home, /auth-confirmation\.html/);
  assert.match(home, /reset-password\.html/);
  assert.doesNotMatch(home, /id="incomeCard"|id="expensesCard"/);
});

test('responsive marketing styles ship in staging without modifying the authenticated app', () => {
  assert.match(home, /styles\/homepage\.css/);
  assert.match(build, /dist\/styles\/homepage\.css/);
  assert.match(css, /@media\(max-width:768px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /prefers-reduced-motion/);
});
