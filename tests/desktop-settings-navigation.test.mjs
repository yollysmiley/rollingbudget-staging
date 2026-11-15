import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const header = html.split('<header>')[1]?.split('</header>')[0] ?? '';
const panel = html.split('<section id="desktopSettingsPanel"')[1]?.split('</section>')[0] ?? '';
const toolbar = html.split('<section class="budget-year-toolbar"')[1]?.split('</section>')[0] ?? '';

test('desktop header retains auth and four primary navigation routes', () => {
  for (const id of ['desktopSettingsButton', 'desktopBudgetButton', 'desktopRecurringButton', 'authBtn']) {
    assert.match(header, new RegExp('id="' + id + '"'));
  }
  assert.match(header, /aria-label="Primary navigation"/);
  assert.doesNotMatch(header, /id="desktopPlanButton"|id="activeYearSelect"/);
});

test('year selection is not a Settings submenu and is accessible beside the budget', () => {
  assert.match(toolbar, /id="activeYearSelect"/);
  assert.match(toolbar, /id="mobileActiveYearSelect"/);
  assert.doesNotMatch(panel, /settingsYears|Budget Years|data-settings-section="years"|createNewYear/);
  for (const id of ['settingsAccounts', 'settingsAutomation', 'settingsProfile', 'autoRollToggle']) {
    assert.match(panel, new RegExp('id="' + id + '"'));
  }
});

test('desktop Settings remains reversible and mobile views own independent controls', () => {
  assert.match(html, /function setDesktopSettings\(open\)/);
  assert.match(html, /function showDesktopPage\(page\)/);
  assert.match(html, /id="mobileSettingsPanel"[\s\S]*id="mobileAutoRollToggle"/);
  assert.match(html, /desktop-settings-open/);
  assert.match(html, /function syncMobileSettingsControls\(\)/);
  assert.match(html, /setDesktopSettings\(false\)/);
});

test('desktop Settings selects exactly one of three sections', () => {
  for (const section of ['accounts', 'automation', 'security']) {
    assert.match(panel, new RegExp('data-settings-section="' + section + '"'));
  }
  assert.doesNotMatch(panel, /data-settings-section="years"|href="#settings/);
  for (const id of ['settingsAutomation', 'settingsProfile']) {
    assert.match(panel, new RegExp('id="' + id + '" hidden'));
  }
  assert.match(html, /function showSettingsSection\(section\)/);
  assert.match(html, /panel\.hidden = key !== section/);
});

test('mobile Settings menu and detail remain separate from the year toolbar', () => {
  assert.match(html, /id="mobileSettingsMenu"/);
  assert.match(html, /id="mobileSettingsDetail" hidden/);
  for (const section of ['accounts','automation','security']) {
    assert.match(html, new RegExp('data-mobile-settings-section="' + section + '"'));
  }
  assert.doesNotMatch(html, /data-mobile-settings-section="years"/);
  assert.match(html, /function showMobileSettingsSection\(section\)/);
  assert.match(html, /Back to Settings/);
});
