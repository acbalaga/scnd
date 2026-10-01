import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findings, MIN_DEGRADATION_PAIRS, PAYBACK_MIN_DAYS } from '../public/js/findings.js';

const bill = (o = {}) => ({ start: '2026-03-15', end: '2026-04-14', pr: 0.78, band: 'green', redRaised: false, actualKwh: 560, expectedKwh: 583, weather: null, flags: [], savings: 5000, ...o });

test('findings golden: two low months raise a question with the latest period and PR', () => {
  const r = findings({ bills: [bill({ band: 'red', pr: 0.5 }), bill({ band: 'red', pr: 0.48, redRaised: true })], payback: null });
  assert.equal(r.items[0].id, 'two_low'); assert.match(r.items[0].text, /two months in a row/); assert.match(r.items[0].text, /0\.48/);
  assert.equal(r.allClear, false);
});
test('findings golden: weather split, clipping, no export and payback each produce their own question', () => {
  const w = { wi: 0.9, uncertain: false, inferred: false, split: { weather: 58, system: 40, total: 98 } };
  const r = findings({ bills: [bill({ band: 'amber', pr: 0.7, weather: w, flags: ['clipping', 'no_export_after_activation'] })], payback: { saved: 8000, promised: 10000, days: PAYBACK_MIN_DAYS } });
  assert.deepEqual(r.items.map((i) => i.id), ['one_low', 'weather_split', 'clipping', 'no_export', 'payback']);
  assert.match(r.items[4].text, /20% behind/);
});
test('findings edge: sunny weather is worded as extra expected output, not "0 kWh explained by weather"', () => {
  const w = { wi: 1.1, uncertain: false, inferred: false, split: { weather: -60, system: 160, total: 100 } };
  const t = findings({ bills: [bill({ band: 'red', pr: 0.4, weather: w })], payback: null }).items.find((i) => i.id === 'weather_split').text;
  assert.match(t, /sunnier than typical/); assert.match(t, /60 kWh/); assert.ok(!/About 0 kWh/.test(t));
});
test('findings golden: grid charging and degradation beyond warranty each produce a question', () => {
  const r = findings({ bills: [bill({ hybridFlags: ['grid_charging'] })], payback: null, degradation: { annualLossPct: 2.3, pairs: MIN_DEGRADATION_PAIRS, exceedsWarranty: true, warrantyPct: 0.5 } });
  assert.deepEqual(r.items.map((i) => i.id), ['grid_charging', 'degradation']);
  assert.match(r.items[1].text, /2\.3%/); assert.match(r.items[1].text, /0\.5%/); assert.match(r.items[1].text, /noise/);
});
test('findings golden: efficiency drop raises a battery question; unflagged does not', () => {
  const r = findings({ bills: [bill()], payback: null, efficiency: { baseline: 0.9, latest: 0.83, dropPoints: 0.07, flagged: true } });
  assert.equal(r.items[0].id, 'rte_drop'); assert.match(r.items[0].text, /7 points/); assert.match(r.items[0].text, /90%/);
  assert.equal(findings({ bills: [bill()], payback: null, efficiency: { baseline: 0.9, latest: 0.89, dropPoints: 0.01, flagged: false } }).allClear, true);
});
test('findings edge: few degradation pairs appear as an awareness note, not a question', () => {
  const r = findings({ bills: [bill()], payback: null, degradation: { annualLossPct: 3.7, pairs: 2, exceedsWarranty: true, warrantyPct: 0.5 } });
  assert.equal(r.allClear, true); assert.equal(r.uncertainty.length, 2); assert.match(r.uncertainty[1], /too few months to act on/); assert.match(r.uncertainty[1], /3\.7% down/);
});
test('findings edge: too few pairs, within warranty or null raises no degradation question', () => {
  assert.equal(findings({ bills: [bill()], payback: null, degradation: { annualLossPct: 3, pairs: MIN_DEGRADATION_PAIRS - 1, exceedsWarranty: true, warrantyPct: 0.5 } }).allClear, true);
  assert.equal(findings({ bills: [bill()], payback: null, degradation: { annualLossPct: 0.3, pairs: 4, exceedsWarranty: false, warrantyPct: 0.5 } }).allClear, true);
  assert.equal(findings({ bills: [bill()], payback: null, degradation: null }).allClear, true);
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
test('findings edge: an older amber month clears the questions but not the "every bill in range" claim', () => {
  const r = findings({ bills: [bill({ band: 'amber', pr: 0.7 }), bill()], payback: null });
  assert.equal(r.allClear, true); assert.equal(r.allGreen, false);
  assert.equal(findings({ bills: [bill(), bill()], payback: null }).allGreen, true);
});
test('findings edge: a small payback gap early on is a note, not a question; after a year it is a question', () => {
  const early = findings({ bills: [bill()], payback: { saved: 9000, promised: 10000, days: 60 } });
  assert.equal(early.items.length, 0); assert.match(early.uncertainty.at(-1), /10% behind/);
  const year = findings({ bills: [bill()], payback: { saved: 9000, promised: 10000, days: PAYBACK_MIN_DAYS } });
  assert.deepEqual(year.items.map((i) => i.id), ['payback']);
  assert.equal(findings({ bills: [bill()], payback: { saved: 12000, promised: 10000, days: 60 } }).uncertainty.length, 1);
});
test('findings edge: even a large payback gap waits for a year of bills (a wet-season start reads far behind)', () => {
  const wet = findings({ bills: [bill()], payback: { saved: 7900, promised: 10000, days: 92 } });
  assert.equal(wet.items.length, 0); assert.match(wet.uncertainty.at(-1), /21% behind the promised payback pace, over 92 days/);
  const justShort = findings({ bills: [bill()], payback: { saved: 5000, promised: 10000, days: PAYBACK_MIN_DAYS - 1 } });
  assert.equal(justShort.items.length, 0);
});
