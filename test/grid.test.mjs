import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { interpolate, isLowDiffuse, lookup, LOW_DIFFUSE_FRACTION } from '../public/js/grid.js';
import { GSA_MANILA_GHI_KWH_M2_MONTH } from './fixtures-gsa.mjs';

const GRID_PATH = new URL('../public/data/ph-grid.json', import.meta.url);
const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const annualMean = (m) => m.reduce((s, v) => s + v, 0) / 12;

// Synthetic 2x2 grid: value = 10*i + j + month index, so bilinear results are easy to check.
const tiny = (() => {
  const cells = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) cells.push(Array.from({ length: 12 }, (_, m) => 10 * i + j + m));
  return { lat0: 10, lon0: 120, step: 0.5, nLat: 2, nLon: 2, ghi: cells, dif: cells, t2m: cells };
})();

test('interpolate returns the cell value at a grid node', () => {
  assert.equal(interpolate(tiny, 'ghi', 10.5, 120)[0], 10);
});
test('interpolate is bilinear at the cell centre', () => {
  assert.ok(Math.abs(interpolate(tiny, 'ghi', 10.25, 120.25)[3] - (5.5 + 3)) < 1e-9);
});
test('interpolate returns null outside the grid or on a no-data corner', () => {
  assert.equal(interpolate(tiny, 'ghi', 9, 120.2), null);
  assert.equal(interpolate({ ...tiny, ghi: [null, ...tiny.ghi.slice(1)] }, 'ghi', 10.25, 120.25), null);
});
test('lookup returns all three fields', () => {
  assert.deepEqual(Object.keys(lookup(tiny, 10.2, 120.2)), ['ghi', 'dif', 't2m']);
});

// Checks below need the real grid from `node scripts/build-grid.mjs`.
const hasGrid = existsSync(GRID_PATH);
const real = hasGrid ? JSON.parse(readFileSync(GRID_PATH, 'utf8')) : null;
const opts = { skip: hasGrid ? false : 'public/data/ph-grid.json not built yet' };

test('grid file is under 250 KB', opts, () => {
  assert.ok(statSync(GRID_PATH).size < 250 * 1024);
});
test('Manila annual GHI within 5% of Global Solar Atlas', opts, () => {
  const g = lookup(real, 14.6, 121.0).ghi;
  const nasa = g.reduce((s, v, m) => s + v * DAYS[m], 0);
  const gsa = GSA_MANILA_GHI_KWH_M2_MONTH.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(nasa / gsa - 1) <= 0.05, `NASA ${nasa.toFixed(0)} vs GSA ${gsa.toFixed(0)} kWh/m2/yr`);
});
// Bound is 0.3 to 0.7 everywhere, except cells flagged by isLowDiffuse (very clear dry season),
// which may go down to 0.27. Flagged cells must be the Feb to Apr clear-sky set only.
test('diffuse fraction is 0.3 to 0.7, or 0.27 to 0.7 for flagged low-diffuse cells', opts, () => {
  real.ghi.forEach((g, k) => {
    const flagged = isLowDiffuse({ ghi: g, dif: real.dif[k] });
    g.forEach((v, m) => {
      const f = real.dif[k][m] / v;
      assert.ok(f >= (flagged ? 0.27 : LOW_DIFFUSE_FRACTION) && f <= 0.7, `cell ${k} month ${m + 1}: ${f.toFixed(3)}`);
      if (flagged && f < LOW_DIFFUSE_FRACTION) assert.ok(m >= 1 && m <= 3, `cell ${k}: low diffuse outside Feb-Apr (month ${m + 1})`);
    });
  });
});
test('isLowDiffuse flags synthetic clear-sky points and passes normal ones', () => {
  const ghi = Array(12).fill(5);
  assert.equal(isLowDiffuse({ ghi, dif: Array(12).fill(2) }), false);
  assert.equal(isLowDiffuse({ ghi, dif: Array(12).fill(1.4) }), true);
});
test('isLowDiffuse is true in the Mindoro dry-season area and false at Manila', opts, () => {
  assert.equal(isLowDiffuse(lookup(real, 11.5, 121.0)), true);
  assert.equal(isLowDiffuse(lookup(real, 14.6, 121.0)), false);
});

// TODO(Fred): the spike 2 NASA monthly means for Laoag, Iloilo, Cebu, Davao are in README/public/spike2.html
// results, not in the repo as data. Fill SPIKE2_ANNUAL_MEAN (kWh/m2/day) to enable this check.
const SPIKE2_ANNUAL_MEAN = { laoag: null, iloilo: null, cebu: null, davao: null };
const SITES = { laoag: [18.2, 120.6], iloilo: [10.7, 122.56], cebu: [10.3, 123.9], davao: [7.07, 125.6] };
for (const [name, [lat, lon]] of Object.entries(SITES)) {
  test(`${name} annual GHI within 8% of spike 2`, { skip: hasGrid && SPIKE2_ANNUAL_MEAN[name] ? false : 'needs grid and spike 2 value' }, () => {
    const mean = annualMean(lookup(real, lat, lon).ghi);
    assert.ok(Math.abs(mean / SPIKE2_ANNUAL_MEAN[name] - 1) <= 0.08);
  });
}
