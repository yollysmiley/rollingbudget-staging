import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build-staging.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/settings.css', import.meta.url), 'utf8');
const desktop = html.split('<section id="desktopSettingsPanel"')[1]?.split('</section>')[0] ?? '';
const mobile = html.split('<section id="mobileSettingsPanel"')[1]?.split('</section>')[0] ?? '';
const yearToolbar = html.split('<section class="budget-year-toolbar"')[1]?.split('</section>')[0] ?? '';

test('desktop Settings retains accounts, automation and security without a year submenu', () => {
  for (const id of ['settingsAccounts','settingsAutomation','settingsProfile','autoRollToggle']) {
    assert.match(desktop, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(desktop, /settingsYears|activeYearSelect|createNewYear|data-settings-section="years"/);
});

test('independent desktop and mobile year selectors are mounted outside Settings', () => {
  for (const id of ['activeYearSelect', 'mobileActiveYearSelect']) {
    assert.match(yearToolbar, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(desktop + mobile, /activeYearSelect|mobileActiveYearSelect|Budget Years/);
  assert.doesNotMatch(html, /onclick="createNewYear\(\)"/);
});

test('mobile Settings keeps distinct rollover controls and no years section', () => {
  assert.match(mobile, /id="mobileAutoRollToggle"/);
  assert.match(mobile, /Rollover &amp; Automation/);
  assert.match(mobile, /Profile &amp; Security/);
  assert.doesNotMatch(mobile, /data-mobile-settings-section="years"|mobileSettingsControls/);
});

test('responsive year controls share state but never move DOM controls between views', () => {
  const sync = html.split('function syncMobileSettingsControls()')[1]?.split('async function setAutoCascade')[0] ?? '';
  assert.match(sync, /\['activeYearSelect', 'mobileActiveYearSelect'\]/);
  assert.match(sync, /select\.replaceChildren/);
  assert.match(sync, /select\.value = activeYear/);
  assert.match(sync, /toggle\.checked/);
  assert.doesNotMatch(sync, /cloneNode\(|appendChild\(/);
  assert.match(html, /async function setAutoCascade\(enabled\)/);
});

test('year toolbar is styled responsively and Settings CSS is deployed', () => {
  assert.match(html, /styles\/settings\.css/);
  assert.match(build, /dist\/app\/styles\/settings\.css/);
  assert.match(css, /budget-year-picker-mobile/);
  assert.match(css, /@media\(max-width:768px\)/);
  assert.match(css, /@media\(min-width:769px\)/);
});

test('recurring navigation remains separate from automation Settings', () => {
  const automation = desktop.split('id="settingsAutomation"')[1]?.split('id="settingsProfile"')[0] ?? '';
  assert.match(automation, /id="autoRollToggle"/);
  assert.doesNotMatch(automation, /openRecurringModal\(\)/);
  assert.match(html, /id="desktopRecurringButton"/);
  assert.match(html, /data-mobile-action="recurring"/);
});
