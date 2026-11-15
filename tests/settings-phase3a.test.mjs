import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build-staging.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/settings.css', import.meta.url), 'utf8');
const desktop = html.split('<section id="desktopSettingsPanel"')[1]?.split('</section>')[0] ?? '';
const mobile = html.split('<section id="mobileSettingsPanel"')[1]?.split('</section>')[0] ?? '';

test('desktop Settings retains four sections and original control IDs', () => {
  for (const id of ['settingsAccounts','settingsYears','settingsAutomation','settingsProfile','activeYearSelect','autoRollToggle']) {
    assert.match(desktop, new RegExp('id="' + id + '"'));
  }
});
test('mobile Settings owns distinct year and rollover controls', () => {
  for (const id of ['mobileSettingsAccounts','mobileSettingsControls','mobileActiveYearSelect','mobileAutoRollToggle']) {
    assert.match(mobile, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(mobile, /id="activeYearSelect"|id="autoRollToggle"/);
  assert.match(mobile, /Rollover &amp; Automation/);
  assert.match(mobile, /Profile &amp; Security/);
});
test('responsive state synchronization does not move DOM controls between views', () => {
  const sync = html.split('function syncMobileSettingsControls()')[1]?.split('function setMobileTab(tab)')[0] ?? '';
  assert.match(sync, /cloneNode\(true\)/);
  assert.match(sync, /mobile\.value = activeYear/);
  assert.match(sync, /toggle\.checked/);
  assert.doesNotMatch(sync, /appendChild\(|append\(/);
  assert.match(html, /function setAutoCascade\(enabled\)/);
});
test('settings stylesheet is published for the authenticated app', () => {
  assert.match(html, /styles\/settings\.css/);
  assert.match(build, /dist\/app\/styles\/settings\.css/);
  assert.match(css, /@media\(max-width:768px\)/);
  assert.match(css, /@media\(min-width:769px\)/);
});

test('desktop automation controls are mounted in the automation screen, never hidden in Budget Years', () => {
  const years = desktop.split('id="settingsYears"')[1]?.split('id="settingsAutomation"')[0] ?? '';
  const automation = desktop.split('id="settingsAutomation"')[1]?.split('id="settingsProfile"')[0] ?? '';
  assert.match(years, /id="activeYearSelect"/);
  assert.match(years, /onclick="createNewYear\(\)"/);
  assert.doesNotMatch(years, /id="autoRollToggle"|onclick="openRecurringModal\(\)"/);
  assert.match(automation, /id="autoRollToggle"/);
  assert.match(automation, /onclick="openRecurringModal\(\)"/);
});

test('auto-cascade writes shared state without synthetic desktop events', () => {
  const setter = html.split('async function setAutoCascade(enabled)')[1]?.split('function setMobileTab(tab)')[0] ?? '';
  assert.match(setter, /db\[activeYear\]\.autoCascade = Boolean\(enabled\)/);
  assert.match(setter, /await saveDB\(\)/);
  assert.match(setter, /render\(\)/);
  assert.doesNotMatch(setter, /dispatchEvent/);
  assert.match(html, /if \(tab === "settings"\) showMobileSettingsMenu\(\)/);
});
