import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as c from '../public/js/calc.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const poaCases = JSON.parse(readFileSync(new URL('./fixtures-poa.json', import.meta.url), 'utf8')).cases;

// ---- poaMonth: pvlib golden cases, pass rule +/-3% ----
for (const k of poaCases) {
  test(`poaMonth golden: ${k.name}, month ${k.month}`, () => {
    const v = c.poaMonth({ ghi: k.ghi, dif: k.dif, tilt: k.tilt, azimuth: k.azimuth, lat: k.lat, month: k.month, days: k.days });
    const err = v / k.kwhPerM2 - 1;
    assert.ok(Math.abs(err) <= 0.03, `${k.name} m${k.month}: ${v.toFixed(2)} vs pvlib ${k.kwhPerM2} (${(err * 100).toFixed(2)}%)`);
  });
}
test('poaMonth: flat plane returns GHI x days', () => {
  near(c.poaMonth({ ghi: 5, dif: 2, tilt: 0, azimuth: 0, lat: 14.6, month: 3 }), 5 * 31, 0.5);
});
test('poaMonth edge: bad input returns an error object', () => {
  assert.ok(c.isError(c.poaMonth({ ghi: 5, dif: 6, tilt: 10, azimuth: 0, lat: 14.6, month: 1 })));
  assert.ok(c.isError(c.poaMonth({ ghi: 5, dif: 2, tilt: 10, azimuth: 0, lat: 14.6, month: 13 })));
  assert.ok(c.isError(c.poaMonth({ ghi: NaN, dif: 2, tilt: 10, azimuth: 0, lat: 14.6, month: 1 })));
});

// ---- splitPeriod, poaPeriod ----
test('splitPeriod golden: 15 Jan to 14 Feb is 17 days in Jan and 13 in Feb', () => {
  assert.deepEqual(c.splitPeriod('2026-01-15', '2026-02-14'), [{ year: 2026, month: 1, days: 17 }, { year: 2026, month: 2, days: 13 }]);
});
test('splitPeriod edge: reversed, same-day, over 62 days and bad dates are errors', () => {
  assert.equal(c.splitPeriod('2026-02-14', '2026-01-15').error, 'bad_period');
  assert.equal(c.splitPeriod('2026-01-15', '2026-01-15').error, 'bad_period');
  assert.equal(c.splitPeriod('2026-01-01', '2026-04-01').error, 'bad_period');
  assert.ok(c.isError(c.splitPeriod('', '2026-01-15')));
});
test('poaPeriod golden: a whole calendar month matches poaMonth', () => {
  const ghi = Array(12).fill(5), dif = Array(12).fill(2);
  const a = c.poaPeriod({ ghi, dif, tilt: 10, azimuth: 0, lat: 14.6, start: '2026-03-01', end: '2026-04-01' });
  near(a.hPoa, c.poaMonth({ ghi: 5, dif: 2, tilt: 10, azimuth: 0, lat: 14.6, month: 3 }), 1e-9);
  assert.equal(a.days, 31); assert.equal(a.midMonth, 3); assert.equal(a.midYear, 2026);
});
test('poaPeriod golden: a straddling period weights each month by its days', () => {
  const ghi = [4, 6, ...Array(10).fill(5)], dif = Array(12).fill(2);
  const a = c.poaPeriod({ ghi, dif, tilt: 0, azimuth: 0, lat: 14.6, start: '2026-01-16', end: '2026-02-16' });
  near(a.hPoa, (16 * 4 + 15 * 6) * 1, 3); assert.equal(a.midMonth, 1);
});
test('poaPeriod edge: a bad period returns an error object', () => {
  assert.ok(c.isError(c.poaPeriod({ ghi: Array(12).fill(5), dif: Array(12).fill(2), tilt: 10, azimuth: 0, lat: 14.6, start: '2026-03-10', end: '2026-03-01' })));
});

// ---- performanceRatio ----
test('performanceRatio golden: 480 kWh, 4 kWp, 160 kWh/m2 = 0.75', () => near(c.performanceRatio({ eKwh: 480, kWp: 4, hPoa: 160 }), 0.75));
test('performanceRatio edge: zero irradiation and negative energy are errors', () => {
  assert.ok(c.isError(c.performanceRatio({ eKwh: 480, kWp: 4, hPoa: 0 })));
  assert.ok(c.isError(c.performanceRatio({ eKwh: -1, kWp: 4, hPoa: 100 })));
});

// ---- expectedEnergy ----
test('expectedEnergy golden: 4 kWp x 150 x 0.75 = 450', () => near(c.expectedEnergy({ kWp: 4, hPoa: 150, pr: 0.75 }), 450));
test('expectedEnergy edge: zero kWp is an error', () => assert.ok(c.isError(c.expectedEnergy({ kWp: 0, hPoa: 150, pr: 0.75 }))));

// ---- prBand, isDrySeason ----
test('prBand golden: boundaries, dry and wet season', () => {
  assert.equal(c.prBand(0.75, 7), 'green');
  assert.equal(c.prBand(0.70, 7), 'amber');
  assert.equal(c.prBand(0.64, 7), 'red');      // wet season floor 0.65
  assert.equal(c.prBand(0.64, 1), 'amber');    // dry season floor 0.62
  assert.equal(c.prBand(0.62, 12), 'amber');
  assert.equal(c.prBand(0.619, 12), 'red');
});
test('prBand edge: bad month is an error', () => assert.ok(c.isError(c.prBand(0.7, 0))));
test('isDrySeason golden and edge: Nov to May dry, Jun to Oct wet', () => {
  assert.deepEqual([5, 6, 10, 11].map(c.isDrySeason), [true, false, false, true]);
});

// ---- redFlag ----
test('redFlag golden: two consecutive reds', () => assert.equal(c.redFlag(['green', 'red', 'red']), true));
test('redFlag edge: single red, red-amber-red, empty', () => {
  assert.equal(c.redFlag(['green', 'red']), false);
  assert.equal(c.redFlag(['red', 'amber', 'red']), false);
  assert.equal(c.redFlag([]), false);
});

// ---- weatherIndex, weatherSplit, weatherCall ----
test('weatherIndex golden: 140 / 160 = 0.875', () => near(c.weatherIndex({ hActual: 140, hTypical: 160 }), 0.875));
test('weatherIndex edge: zero typical is an error', () => assert.ok(c.isError(c.weatherIndex({ hActual: 1, hTypical: 0 }))));
test('weatherSplit golden: 500 typical, WI 0.9, 400 actual = 50 weather + 50 system', () => {
  const r = c.weatherSplit({ eTypical: 500, wi: 0.9, eActual: 400 });
  near(r.weather, 50); near(r.system, 50); near(r.total, 100);
});
test('weatherSplit edge: system part goes negative when output beats the weather-adjusted expectation', () => {
  assert.ok(c.weatherSplit({ eTypical: 500, wi: 0.9, eActual: 460 }).system < 0);
  assert.ok(c.isError(c.weatherSplit({ eTypical: 0, wi: 0.9, eActual: 1 })));
});
test('weatherCall golden: 0.92 and 0.90 agree', () => {
  const r = c.weatherCall(0.92, 0.90); near(r.wi, 0.91); assert.equal(r.uncertain, false); assert.equal(r.source, 'both'); assert.equal(r.inferred, false);
});
test('weatherCall edge: more than 5 points apart is uncertain; NaN is an error', () => {
  assert.equal(c.weatherCall(0.95, 0.88).uncertain, true);
  assert.ok(c.isError(c.weatherCall(NaN, 0.9)));
});
test('weatherCall edge: one missing source is inferred, both missing is null', () => {
  assert.deepEqual(c.weatherCall(null, 0.9), { wi: 0.9, uncertain: false, source: 'nasa', inferred: true });
  assert.deepEqual(c.weatherCall(0.93, null), { wi: 0.93, uncertain: false, source: 'satellite', inferred: true });
  assert.equal(c.weatherCall(null, null), null);
});

// ---- weatherBaseline, weatherIndexPeriod ----
// Synthetic daily series: 5.0 kWh/m2/day everywhere in 2020 to 2025 (a 2026 value must not enter the baseline).
const dailySeries = (fn) => {
  const out = {};
  for (let t = Date.parse('2020-01-01'); t <= Date.parse('2026-09-20'); t += 86400000) { const d = new Date(t).toISOString().slice(0, 10); out[d] = fn(d); }
  return out;
};
test('weatherBaseline golden: constant 5.0 in 2020 to 2025 gives 5.0 every month, ignoring 2026', () => {
  const b = c.weatherBaseline(dailySeries((d) => (d < '2026' ? 5 : 99)));
  assert.equal(b.length, 12); b.forEach((v) => near(v, 5));
});
test('weatherBaseline edge: too few valid days is an error', () => {
  assert.equal(c.weatherBaseline(dailySeries((d) => (d.slice(5, 7) === '04' ? null : 5))).error, 'no_baseline');
  assert.equal(c.weatherBaseline({}).error, 'no_baseline');
});
test('weatherIndexPeriod golden: 4.5 against a 5.0 baseline is 0.9 across a month boundary', () => {
  const daily = dailySeries((d) => (d < '2026' ? 5 : 4.5));
  const r = c.weatherIndexPeriod({ daily, baseline: Array(12).fill(5), start: '2026-01-15', end: '2026-02-14' });
  near(r.wi, 0.9); assert.equal(r.days, 30); assert.equal(r.validDays, 30);
});
test('weatherIndexPeriod edge: under 80% coverage returns null, bad period is an error', () => {
  const daily = dailySeries((d) => (d < '2026-01-25' ? 4.5 : null));
  assert.equal(c.weatherIndexPeriod({ daily, baseline: Array(12).fill(5), start: '2026-01-15', end: '2026-02-14' }), null);
  assert.ok(c.isError(c.weatherIndexPeriod({ daily, baseline: Array(12).fill(5), start: '2026-02-14', end: '2026-01-15' })));
  assert.ok(c.isError(c.weatherIndexPeriod({ daily, baseline: [1], start: '2026-01-15', end: '2026-02-14' })));
});

// ---- energySplit ----
test('energySplit golden: G 400, X 150, I 200 -> S 250, L 450, ratio 0.625', () => {
  const r = c.energySplit({ g: 400, x: 150, i: 200 });
  near(r.selfConsumed, 250); near(r.load, 450); near(r.selfConsumptionRatio, 0.625);
});
test('energySplit edge: S < 0 returns an error object, not a number', () => {
  const r = c.energySplit({ g: 100, x: 150, i: 200 });
  assert.ok(c.isError(r)); assert.equal(r.error, 'period_misalignment');
});

// ---- money ----
test('importRate golden: 3000 / 300 kWh = 10 per kWh', () => near(c.importRate({ variableCharges: 3000, i: 300 }), 10));
test('importRate edge: zero import is an error', () => assert.ok(c.isError(c.importRate({ variableCharges: 3000, i: 0 }))));
test('savings golden: 250 x 10 + 150 x 5 = 3250', () => near(c.savings({ s: 250, x: 150, rImport: 10, rExport: 5 }), 3250));
test('savings edge: negative self-consumption is an error', () => assert.ok(c.isError(c.savings({ s: -1, x: 0, rImport: 10, rExport: 5 }))));
test('loadShiftValue golden: 11 - 5 = 6', () => near(c.loadShiftValue({ rImport: 11, rExport: 5 }), 6));
test('loadShiftValue edge: missing rate is an error', () => assert.ok(c.isError(c.loadShiftValue({ rImport: 11 }))));

// ---- billDecode ----
// Example only: generation charge 9.70 PHP/kWh is Meralco's September 2026 schedule (docs/SPEC.md); the rest is made up.
test('billDecode golden: 300 kWh in, 220 out at 9.70, 3600 variable, 2100 total', () => {
  const r = c.billDecode({ importKwh: 300, exportKwh: 220, genRate: 9.7, varCharges: 3600, total: 2100 });
  near(r.rImport, 12); near(r.exportCredit, 2134); near(r.afterCredit, 1466); near(r.other, 634);
  near(r.coverage, 2134 / 3600); near(r.exportGap, 2.3); assert.deepEqual(r.flags, []);
});
test('billDecode edge: credit above variable charges keeps other charges above zero and is flagged', () => {
  const r = c.billDecode({ importKwh: 100, exportKwh: 500, genRate: 9.7, varCharges: 1200, total: 400 });
  near(r.afterCredit, 0); near(r.other, 400); assert.ok(r.flags.includes('credit_exceeds_variable'));
});
test('billDecode edge: total below the charges, generation rate above buying rate, bad input', () => {
  assert.ok(c.billDecode({ importKwh: 300, exportKwh: 0, genRate: 9.7, varCharges: 3600, total: 3000 }).flags.includes('total_below_charges'));
  assert.ok(c.billDecode({ importKwh: 300, exportKwh: 0, genRate: 15, varCharges: 3600, total: 3900 }).flags.includes('gen_above_buy'));
  assert.ok(c.isError(c.billDecode({ importKwh: 0, exportKwh: 0, genRate: 9.7, varCharges: 0, total: 0 })));
  assert.ok(c.isError(c.billDecode({ importKwh: 300, exportKwh: NaN, genRate: 9.7, varCharges: 3600, total: 2100 })));
});

// ---- promisedSavings, paybackYearsAtPace ----
test('promisedSavings golden: 365.25 days of a 3-year, 300000 promise is 100000', () => near(c.promisedSavings({ cost: 300000, years: 3, days: 365.25 }), 100000, 1e-6));
test('promisedSavings edge: zero years or negative days is an error', () => {
  assert.ok(c.isError(c.promisedSavings({ cost: 300000, years: 0, days: 10 }))); assert.ok(c.isError(c.promisedSavings({ cost: 300000, years: 3, days: -1 })));
});
test('paybackYearsAtPace golden: 12000 saved in 60 days against 350000 is about 5.9 years', () => {
  near(c.paybackYearsAtPace({ cost: 350000, saved: 12000, days: 60 }), 350000 / (200 * 365.25), 1e-9);
});
test('paybackYearsAtPace edge: no savings and no days are errors', () => {
  assert.equal(c.paybackYearsAtPace({ cost: 350000, saved: 0, days: 60 }).error, 'no_savings');
  assert.ok(c.isError(c.paybackYearsAtPace({ cost: 350000, saved: 100, days: 0 })));
});

// ---- degradation ----
const months = (year, pr) => Array.from({ length: 12 }, (_, m) => ({ year, month: m + 1, pr }));
test('degradation golden: Jan 0.80 to 0.796 is 0.5%/yr, within a 0.55% warranty', () => {
  const r = c.degradation([...months(2025, 0.8), { year: 2026, month: 1, pr: 0.796 }], 0.55);
  near(r.annualLossPct, 0.5, 1e-9); assert.equal(r.pairs, 1); assert.equal(r.exceedsWarranty, false);
});
test('degradation edge: null under 13 months, error on bad pr', () => {
  assert.equal(c.degradation(months(2025, 0.8)), null);
  assert.ok(c.isError(c.degradation([{ year: 2025, month: 1, pr: 0 }])));
});
test('degradation edge: loss above warranty is flagged', () => {
  const r = c.degradation([...months(2025, 0.8), { year: 2026, month: 1, pr: 0.78 }], 1.0);
  near(r.annualLossPct, 2.5); assert.equal(r.exceedsWarranty, true);
});

// ---- hybridBalance, batteryValue ----
test('hybridBalance golden: I 100, PV 400, X 50, C 120, D 108 -> L 438, RTE 0.9', () => {
  const r = c.hybridBalance({ i: 100, gPv: 400, x: 50, c: 120, d: 108 });
  near(r.load, 438); near(r.roundTripEfficiency, 0.9); assert.deepEqual(r.flags, []);
});
test('hybridBalance edge: C above PV surplus raises grid_charging; zero C gives null RTE; negative load is an error', () => {
  assert.deepEqual(c.hybridBalance({ i: 100, gPv: 400, x: 50, c: 360, d: 300 }).flags, ['grid_charging']);
  assert.equal(c.hybridBalance({ i: 100, gPv: 400, x: 50, c: 0, d: 0 }).roundTripEfficiency, null);
  assert.ok(c.isError(c.hybridBalance({ i: 0, gPv: 100, x: 0, c: 150, d: 0 })));
});
test('batteryValue golden: 108 x (11 - 5) = 648', () => near(c.batteryValue({ d: 108, rImport: 11, rExport: 5 }), 648));
test('batteryValue edge: negative discharge is an error', () => assert.ok(c.isError(c.batteryValue({ d: -1, rImport: 11, rExport: 5 }))));

// ---- efficiencyDrop ----
test('efficiencyDrop golden: two bills 5+ points under the first-3 average are flagged', () => {
  const r = c.efficiencyDrop([0.9, 0.9, 0.9, 0.84, 0.83]);
  near(r.baseline, 0.9); near(r.latest, 0.835); near(r.dropPoints, 0.065); assert.equal(r.flagged, true);
});
test('efficiencyDrop edge: one low bill, exactly 5 points, and under 5 valid bills', () => {
  assert.equal(c.efficiencyDrop([0.9, 0.9, 0.9, 0.9, 0.8]).flagged, false);      // only the latest is low
  assert.equal(c.efficiencyDrop([0.9, 0.9, 0.9, 0.85, 0.85]).flagged, true);     // exactly 5 points counts
  assert.equal(c.efficiencyDrop([0.9, 0.9, 0.9, 0.86, 0.86]).flagged, false);    // 4 points does not
  assert.equal(c.efficiencyDrop([0.9, 0.9, 0.9, 0.8]), null);
  assert.equal(c.efficiencyDrop([0.9, null, 0.9, 0.9, null, 0.8, 0.8]).flagged, true);   // gaps are skipped
  assert.ok(c.isError(c.efficiencyDrop('x')));
});

// ---- loadCheck ----
test('loadCheck golden: implied 438 against app 440 is -2 kWh, -0.45%', () => {
  const r = c.loadCheck({ implied: 438, app: 440 }); near(r.gapKwh, -2); near(r.gapPct, -0.4545, 1e-3);
});
test('loadCheck edge: zero or missing app load is an error', () => {
  assert.ok(c.isError(c.loadCheck({ implied: 438, app: 0 }))); assert.ok(c.isError(c.loadCheck({ implied: 438, app: NaN })));
});

// ---- sanityFlags ----
test('sanityFlags golden: DC/AC 1.4, no export after activation, outage', () => {
  assert.deepEqual(c.sanityFlags({ kWp: 7, acKw: 5, exportKwh: 0, netMeteringActive: true, outageHours: 3 }), ['clipping', 'no_export_after_activation', 'outage']);
});
test('sanityFlags edge: DC/AC exactly 1.3, zero export before activation, no outage raise nothing', () => {
  assert.deepEqual(c.sanityFlags({ kWp: 6.5, acKw: 5, exportKwh: 0, netMeteringActive: false, outageHours: 0 }), []);
});

// ---- isError ----
test('isError golden and edge', () => {
  assert.equal(c.isError({ error: 'x', message: 'y' }), true);
  assert.equal(c.isError(0), false); assert.equal(c.isError(null), false); assert.equal(c.isError([]), false);
});
