import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findings } from '../public/js/findings.js';

const bill = (o = {}) => ({ start: '2026-03-15', end: '2026-04-14', pr: 0.78, band: 'green', redRaised: false, actualKwh: 560, expectedKwh: 583, weather: null, flags: [], savings: 5000, ...o });

test('findings golden: two low months raise a question with the latest period and PR', () => {
  const r = findings({ bills: [bill({ band: 'red', pr: 0.5 }), bill({ band: 'red', pr: 0.48, redRaised: true })], payback: null });
  assert.equal(r.items[0].id, 'two_low'); assert.match(r.items[0].text, /two months in a row/); assert.match(r.items[0].text, /0\.48/);
  assert.equal(r.allClear, false);
});
test('findings golden: weather split, clipping, no export and payback each produce their own question', () => {
  const w = { wi: 0.9, uncertain: false, inferred: false, split: { weather: 58, system: 40, total: 98 } };
  const r = findings({ bills: [bill({ band: 'amber', pr: 0.7, weather: w, flags: ['clipping', 'no_export_after_activation'] })], payback: { saved: 8000, promised: 10000 } });
  assert.deepEqual(r.items.map((i) => i.id), ['one_low', 'weather_split', 'clipping', 'no_export', 'payback']);
  assert.match(r.items[4].text, /20% behind/);
});
test('findings edge: sunny weather is worded as extra expected output, not "0 kWh explained by weather"', () => {
  const w = { wi: 1.1, uncertain: false, inferred: false, split: { weather: -60, system: 160, total: 100 } };
  const t = findings({ bills: [bill({ band: 'red', pr: 0.4, weather: w })], payback: null }).items.find((i) => i.id === 'weather_split').text;
  assert.match(t, /sunnier than typical/); assert.match(t, /60 kWh/); assert.ok(!/About 0 kWh/.test(t));
});
test('findings edge: everything in range is all clear, and the sheet never states a verdict or names an installer', () => {
  const r = findings({ bills: [bill(), bill()], payback: { saved: 12000, promised: 10000 } });
  assert.equal(r.allClear, true); assert.equal(r.items.length, 0);
  const all = JSON.stringify(r);
  assert.ok(!/installer (is|was) (at fault|wrong)|faulty|defective/i.test(all));
});
test('findings edge: uncertain and inferred weather are stated in the uncertainty notes', () => {
  const w = (o) => ({ wi: 1, uncertain: false, inferred: false, split: { weather: 0, system: 0, total: 0 }, ...o });
  const r = findings({ bills: [bill({ weather: w({ uncertain: true }) }), bill({ weather: w({ inferred: true }) })], payback: null });
  assert.equal(r.uncertainty.length, 3);
  assert.equal(findings({ bills: [bill()], payback: null }).uncertainty.length, 1);
});
test('findings edge: no bills gives an all-clear empty result, not a crash', () => {
  assert.deepEqual(findings({ bills: [], payback: null }).items, []);
});
