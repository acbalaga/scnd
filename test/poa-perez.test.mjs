// Independent check of poaMonth (ticket #54): test/fixtures-poa-perez.json from scripts/gen-poa-perez.py (pvlib 0.16.1).
// That reference uses every day of the month, clear-sky hourly shapes, the Erbs split and the Perez sky; poaMonth uses a
// mean day, Collares-Pereira and Rabl apportioning and an isotropic sky. These bounds pin today's differences (measured
// 14 Nov 2026, plus 0.5 points) so a later change cannot widen them unnoticed. They are not a pass mark for the model:
// whether to change the sky model is Fred's call (docs/POA-CHECK.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poaMonth } from '../public/js/calc.js';

const { cases } = JSON.parse(readFileSync(new URL('./fixtures-poa-perez.json', import.meta.url), 'utf8'));
const diff = (k, ref) => (poaMonth({ ghi: k.ghi, dif: k.dif, tilt: k.tilt, azimuth: k.azimuth, lat: k.lat, month: k.month }) / k[ref] - 1) * 100;
// % range of poaMonth against Perez, by tilt.
const PEREZ_BOUNDS = { 5: [-2.4, 0.8], 10: [-3.9, 1.2], 20: [-6.4, 2.5], 30: [-8.4, 4.6] };

test('poaMonth against an independent isotropic reference: within 2% (apportioning and geometry)', () => {
  assert.equal(cases.length, 144);
  for (const k of cases) assert.ok(Math.abs(diff(k, 'isotropic')) <= 2, `${k.site} month ${k.month} tilt ${k.tilt} ${k.facing}: ${diff(k, 'isotropic').toFixed(2)}%`);
});

test('poaMonth against Perez: differences stay within today\'s measured range', () => {
  for (const k of cases) {
    const d = diff(k, 'perez'), [lo, hi] = PEREZ_BOUNDS[k.tilt];
    assert.ok(d >= lo && d <= hi, `${k.site} month ${k.month} tilt ${k.tilt} ${k.facing}: ${d.toFixed(2)}% outside ${lo} to ${hi}`);
  }
});
