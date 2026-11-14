// Engine: per-bill results and cross-bill summaries (ticket #44). Real typical-year sun at Cebu from the grid file;
// bill kWh are set from a target PR so each case is easy to read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as e from '../public/js/engine.js';
import * as calc from '../public/js/calc.js';
import { lookup } from '../public/js/grid.js';

const grid = JSON.parse(readFileSync(new URL('../public/data/ph-grid.json', import.meta.url), 'utf8'));
const climate = lookup(grid, 10.3, 123.9);
const setup = { lat: 10.3, lon: 123.9, kWp: 5, acKw: 5, tilt: 10, azimuth: 0, commissioned: '', hybrid: false, netMetering: false, cost: '', promisedYears: '', warrantyPct: '', batteryCost: '' };
const sun = (start, end, s = setup) => calc.poaPeriod({ ghi: climate.ghi, dif: climate.dif, tilt: s.tilt, azimuth: s.azimuth, lat: s.lat, start, end }).hPoa;
let id = 1;
// A bill at a target PR. money: true adds import, export and charges so savings can be worked out.
const bill = (start, end, pr, { money = true, s = setup, ...extra } = {}) => ({
  id: id++, start, end, chargeUnit: 'amount', inverterKwh: Math.round(pr * s.kWp * sun(start, end, s) * 100) / 100,
  ...(money ? { importKwh: 300, exportKwh: 100, genAmount: 2910, varCharges: 3600, total: 1500 } : {}), ...extra,
});
const run = (bills, s = setup, weather = null) => e.buildModel({ setup: s, climate, ready: true, weather, bills });
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('engine golden: a bill at PR 0.80 reads green against a typical year, with savings worked out from the bill', () => {
  const b = bill('2026-03-01', '2026-04-01', 0.80), r = run([b]).results.get(b.id);
  near(r.pr, 0.80, 0.001); assert.equal(r.band, 'green'); assert.equal(r.basis, 'typical');
  near(r.rImport, 12); assert.ok(r.savings > 0);
  near(r.expectedKwh, 5 * r.hPoa * calc.PR_BANDS.green);
});

test('engine edge: not ready, or a bill without both dates, has no result', () => {
  const b = bill('2026-03-01', '2026-04-01', 0.8);
  assert.equal(e.buildModel({ setup, climate, ready: false, weather: null, bills: [b] }).results.get(b.id), null);
  const d = { ...b, id: id++, end: '' };
  assert.equal(run([d]).results.get(d.id), null);
});

test('engine edge: a bill that ends before the switch-on month gets a flag and no PR', () => {
  const b = bill('2026-01-01', '2026-02-01', 0.8), r = run([b], { ...setup, commissioned: '2026-03' }).results.get(b.id);
  assert.deepEqual(r.flags, ['before_commissioning']); assert.equal(r.pr, null);
});

test('engine edge: a minus sign names the field and gives no PR', () => {
  const b = bill('2026-03-01', '2026-04-01', 0.8, { exportKwh: -5 }), r = run([b]).results.get(b.id);
  assert.equal(r.pr, null); assert.match(r.errors[0], /sent to the grid/);
});

test('engine edge: PR above 0.90 or below 0.30 reads "check", and a check-low bill is never red', () => {
  const hi = bill('2026-03-01', '2026-04-01', 0.95), lo = bill('2026-04-01', '2026-05-01', 0.10);
  const m = run([hi, lo]);
  assert.equal(m.results.get(hi.id).band, 'check'); assert.equal(m.results.get(hi.id).checkLow, undefined);
  assert.equal(m.results.get(lo.id).band, 'check'); assert.equal(m.results.get(lo.id).checkLow, true);
  assert.equal(m.red.size, 0);
});

test('engine edge: overlap of one day is a reading-date slip; two days is flagged on the later bill', () => {
  const a = bill('2026-03-01', '2026-04-02', 0.8), b1 = bill('2026-04-01', '2026-05-01', 0.8);
  assert.ok(!run([a, b1]).results.get(b1.id).flags.includes('overlap'));
  const c = bill('2026-03-01', '2026-04-03', 0.8), b2 = bill('2026-04-01', '2026-05-01', 0.8), m = run([c, b2]);
  assert.ok(m.results.get(b2.id).flags.includes('overlap')); assert.ok(!m.results.get(c.id).flags.includes('overlap'));
});

test('engine golden: two red bills in a row raise the flag on the second; a 40-day gap breaks the run', () => {
  const a = bill('2026-06-01', '2026-07-01', 0.55), b = bill('2026-07-01', '2026-08-01', 0.55);
  const m = run([b, a]);   // list order does not matter: runs are by date
  assert.deepEqual([...m.red], [b.id]);
  const c = bill('2026-06-01', '2026-07-01', 0.55), d = bill('2026-08-10', '2026-09-10', 0.55);
  assert.equal(run([c, d]).red.size, 0);
});

test('engine edge: a hybrid bill without battery numbers has PR but no savings', () => {
  const hs = { ...setup, hybrid: true }, b = bill('2026-03-01', '2026-04-01', 0.8, { s: hs }), r = run([b], hs).results.get(b.id);
  assert.ok(r.pr > 0); assert.equal(r.split, null); assert.equal(r.savings, null);
  const full = bill('2026-04-01', '2026-05-01', 0.8, { s: hs, chargeKwh: 150, dischargeKwh: 135 }), rf = run([full], hs).results.get(full.id);
  assert.ok(rf.savings > 0); near(rf.hybrid.roundTripEfficiency, 0.9);
});

test('engine golden: first and last answered bills are list indices', () => {
  const blank = { id: id++, start: '2026-01-01', end: '2026-02-01', chargeUnit: 'amount' };
  const m = run([blank, bill('2026-02-01', '2026-03-01', 0.8), bill('2026-03-01', '2026-04-01', 0.8), { ...blank, id: id++ }]);
  assert.equal(m.firstAnswered, 1); assert.equal(m.lastAnswered, 2);
});

test('engine edge: the savings curve and the chart start on the first bill with savings, not the first dated bill', () => {
  const noMoney = bill('2026-01-01', '2026-02-01', 0.8, { money: false }), b = bill('2026-02-01', '2026-03-01', 0.8), c = bill('2026-03-01', '2026-04-01', 0.8);
  const bills = [noMoney, b, c], m = run(bills), resultOf = (x) => m.results.get(x.id);
  assert.equal(e.savingsStart(bills, resultOf), '2026-02-01');
  const cum = e.cumulativeSavings(bills, resultOf);
  assert.equal(cum.length, 2); near(cum[0].day, 28); near(cum[1].day, 59);
  near(cum[1].saved, resultOf(b).savings + resultOf(c).savings);
});

test('engine golden: payback pace, promised line and the early-season tag', () => {
  const ps = { ...setup, cost: 365250, promisedYears: 5 };
  near(e.promisedPerDay(ps), 200);
  assert.equal(e.promisedPerDay(setup), null);
  const bills = [bill('2026-06-01', '2026-07-01', 0.8), bill('2026-07-01', '2026-08-01', 0.8)], m = run(bills, ps), resultOf = (x) => m.results.get(x.id);
  const cum = e.cumulativeSavings(bills, resultOf), t = e.paybackStats({ setup: ps, cumulative: cum, bills, resultOf, minDays: 360 });
  near(t.days, 61); near(t.promised, 200 * 61); assert.equal(t.early, true); assert.equal(t.season, 'wet');
  near(t.gapPct, (t.saved / t.promised - 1) * 100);
  assert.equal(e.paybackStats({ setup: ps, cumulative: [], bills, resultOf, minDays: 360 }), null);
});

test('engine golden: export credit above the variable charges is summed as left out', () => {
  const b = bill('2026-03-01', '2026-04-01', 0.8, { exportKwh: 500, genAmount: 2910, varCharges: 1200 }), m = run([b]);
  near(e.creditLeftOut([b], (x) => m.results.get(x.id)), 500 * 9.7 - 1200, 1e-6);
});

test('engine golden: battery total and efficiency trend are hybrid only', () => {
  const hs = { ...setup, hybrid: true, batteryCost: 200000 };
  const bills = ['01', '02', '03', '04', '05'].map((mm, k) => bill(`2026-${mm}-01`, `2026-${String(k + 2).padStart(2, '0')}-01`, 0.8, { s: hs, chargeKwh: 100, dischargeKwh: [92, 92, 92, 85, 85][k] }));
  const m = run(bills, hs), resultOf = (x) => m.results.get(x.id);
  const t = e.batteryTotalFor({ setup: hs, bills, resultOf });
  assert.equal(t.bills, 5); assert.equal(t.cost, 200000); assert.ok(t.earned > 0);
  assert.equal(e.efficiencyFor({ setup: hs, bills, resultOf }).flagged, true);
  assert.equal(e.batteryTotalFor({ setup, bills, resultOf }), null);
  assert.equal(e.efficiencyFor({ setup, bills, resultOf }), null);
});

test('engine golden: the weather check adjusts PR; a degradation record skips a rejected weather index', () => {
  // Synthetic daily data: both sources read 10% below their baseline in March 2026, so the index is 0.90.
  const daily = (f) => { const o = {}; for (let t = Date.parse('2020-01-01'); t < Date.parse('2026-04-01'); t += 86400000) { const d = new Date(t).toISOString().slice(0, 10); o[d] = d >= '2026-03-01' ? 5 * f : 5; } return o; };
  const sat = daily(0.9), nasa = daily(0.9);
  const weather = { status: 'done', sat, nasa, satBase: calc.weatherBaseline(sat), nasaBase: calc.weatherBaseline(nasa) };
  const b = bill('2026-03-01', '2026-04-01', 0.70), r = run([b], setup, weather).results.get(b.id);
  near(r.weather.wi, 0.9, 1e-9); assert.equal(r.basis, 'weather'); near(r.pr, r.prTypical / 0.9, 1e-9); assert.equal(r.band, 'green');
  assert.equal(e.degradationFor({ setup, bills: [b], resultOf: () => ({ ...r, weatherRejected: true }) }), null);
});

test('engine edge: year-over-year leaves out months where the weather sources disagreed (ticket #45)', () => {
  const rec = (year, month, pr, extra = {}) => ({ midYear: year, midMonth: month, weather: { prAdjusted: pr, uncertain: false, source: 'both', days: 30, ...extra } });
  const rows = [rec(2025, 1, 0.8), rec(2025, 2, 0.8), ...Array.from({ length: 10 }, (_, k) => rec(2025, k + 3, 0.8)), rec(2026, 1, 0.79), rec(2026, 2, 0.6, { uncertain: true })];
  const bills = rows.map((_, k) => ({ id: k })), resultOf = (b) => rows[b.id];
  const d = e.degradationFor({ setup: { warrantyPct: 0.5 }, bills, resultOf });
  assert.equal(d.pairs, 1); assert.ok(Math.abs(d.annualLossPct - 1.25) < 1e-9); assert.equal(d.warrantyPct, 0.5);
});
