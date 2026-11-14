// Weather-source health (ticket #48).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { lastMonths, monthStatus, nearestStatus, satelliteGaps, COVERAGE_OK } from '../public/js/sources.js';
import { CITIES } from '../public/js/cities.js';

test('sources golden: the 13 full months before today', () => {
  const m = lastMonths('2026-11-14');
  assert.equal(m.length, 13); assert.equal(m[0], '2025-10'); assert.equal(m.at(-1), '2026-10');
  assert.deepEqual(lastMonths('2026-01-05', 2), ['2025-11', '2025-12']);
});

test('sources golden: share of valid days and the month index against the baseline', () => {
  const daily = {};
  for (let d = 1; d <= 30; d++) daily[`2026-09-${String(d).padStart(2, '0')}`] = d <= 27 ? 4.5 : null;   // 27 of 30 days
  for (let d = 1; d <= 31; d++) daily[`2026-10-${String(d).padStart(2, '0')}`] = d <= 10 ? 5 : null;      // 10 of 31 days
  const baseline = Array(12).fill(5);
  const [sep, oct] = monthStatus(daily, baseline, ['2026-09', '2026-10']);
  assert.equal(sep.share, 0.9); assert.equal(sep.wi, 0.9);
  assert.equal(oct.share, 0.32); assert.equal(oct.wi, null);
  assert.equal(monthStatus(daily, null, ['2026-09'])[0].wi, null);
});

const status = { months: ['2026-08', '2026-09', '2026-10'], cities: [
  { name: 'Manila', lat: 14.6, lon: 121.0, sat: [0, 0.6, 0.06], nasa: [1, 1, 1] },
  { name: 'Cebu', lat: 10.3, lon: 123.9, sat: [1, 1, 1], nasa: [1, 1, 1] }] };

test('sources golden: nearest city, and the months where the satellite falls short there', () => {
  assert.equal(nearestStatus(status, 14.5, 121.1).name, 'Manila');
  assert.deepEqual(satelliteGaps(status, 14.5, 121.1, ['2026-10', '2026-08', '2026-10', '2026-07']), { city: 'Manila', months: ['2026-08', '2026-10'] });
  assert.deepEqual(satelliteGaps(status, 10.3, 123.9, ['2026-09']), { city: 'Cebu', months: [] });
  assert.deepEqual(satelliteGaps(null, 10.3, 123.9, ['2026-09']), { city: null, months: [] });
  assert.equal(COVERAGE_OK, 0.8);
});

const FILE = new URL('../public/data/source-status.json', import.meta.url);
test('sources: the committed status file has every city and 13 months of shares', { skip: existsSync(FILE) ? false : 'not built yet' }, () => {
  const s = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.match(s.built, /^\d{4}-\d{2}-\d{2}$/); assert.equal(s.months.length, 13);
  assert.deepEqual(s.cities.map((c) => c.name), CITIES.map((c) => c.name));
  for (const c of s.cities) for (const k of ['sat', 'nasa', 'satWi', 'nasaWi']) assert.equal(c[k].length, 13, `${c.name} ${k}`);
  for (const c of s.cities) for (const v of [...c.sat, ...c.nasa]) assert.ok(v >= 0 && v <= 1);
});
