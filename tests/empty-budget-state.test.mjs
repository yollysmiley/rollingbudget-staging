import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');

test('budget starts empty and clears stored values on load', () => {
  assert.match(html, /const BASELINE_2026 = \{[\s\S]*recurringRules:\s*\[],/m);
  assert.doesNotMatch(html, /4015\.79|3498\.73|1050\.86|Yolande Pay|Planet Home Lending/);
  assert.match(html, /for \(const key of Object\.keys\(localStorage\)\) \{\s*if \(key\.startsWith\("budget_cloud_"\)\)/s);
  assert.match(html, /recordedLeftover:\s*0/);
  assert.match(html, /income:\s*\[]/);
});
