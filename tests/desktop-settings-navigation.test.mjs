import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const header = html.split('<header>')[1]?.split('</header>')[0] ?? '';
const panel = html.split('<section id="desktopSettingsPanel"')[1]?.split('</section>')[0] ?? '';

test('desktop header retains authentication and exposes Settings navigation', () => {
  assert.match(header, /id="desktopSettingsButton"/);
  assert.match(header, /id="desktopBudgetButton"/);
  assert.match(header, /id="authBtn"/);
  assert.match(header, /aria-label="Primary navigation"/);
  assert.match(header, /id="desktopPlanButton"/);
  assert.match(header, /id="desktopRecurringButton"/);
  assert.doesNotMatch(header, /id="activeYearSelect"|id="autoRollToggle"|openRecurringModal\(\)/);
});

test('desktop Settings contains existing year and rollover controls', () => {
  assert.match(panel, /id="budgetSettingsControls"/);
  for (const id of ['settingsAccounts', 'settingsYears', 'settingsAutomation', 'settingsProfile']) assert.match(panel, new RegExp('id="' + id + '"'));
  assert.match(panel, /id="activeYearSelect"/);
  assert.match(panel, /createNewYear\(\)/);
  assert.match(panel, /id="autoRollToggle"/);
  assert.match(panel, /openRecurringModal\(\)/);
});

test('desktop Settings is reversible and mobile controls retain a separate mount', () => {
  assert.match(html, /function setDesktopSettings\(open\)/);
  assert.match(html, /function showDesktopPage\(page\)/);
  assert.match(html, /id="mobileSettingsPanel"[\s\S]*id="mobileSettingsControls"/);
  assert.match(html, /desktop-settings-open/);
  assert.match(html, /function syncMobileSettingsControls\(\)/);
  assert.match(html, /id="mobileSettingsControls"/);
  assert.match(html, /setDesktopSettings\(false\)/);
});
