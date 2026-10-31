import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as c from '../public/js/calc.js';
import { lookup } from '../public/js/grid.js';
import { EXAMPLES, exampleBills } from '../public/js/examples.js';

const grid = JSON.parse(readFileSync(new URL('../public/data/ph-grid.json', import.meta.url), 'utf8'));
const now = new Date('2026-10-31T00:00:00Z');

for (const kind of Object.keys(EXAMPLES)) {
  test(`examples: ${kind} bills are back to back and every bill gives a PR, a split and savings`, () => {
    const s = EXAMPLES[kind].setup, climate = lookup(grid, s.lat, s.lon);
    const bills = exampleBills(kind, { climate, now });
    assert.equal(bills.at(-1).end, '2026-10-01');
    assert.equal(c.billGaps(bills).length, 0);
    for (const b of bills) {
      const p = c.poaPeriod({ ghi: climate.ghi, dif: climate.dif, tilt: s.tilt, azimuth: s.azimuth, lat: s.lat, start: b.start, end: b.end });
      const pr = c.performanceRatio({ eKwh: b.inverterKwh, kWp: s.kWp, hPoa: p.hPoa });
      assert.ok(pr >= 0.65 && pr <= 0.85, `${b.start} PR ${pr}`);
      const split = c.energySplit({ g: b.inverterKwh, x: b.exportKwh, i: b.importKwh, ...(s.hybrid ? { c: b.chargeKwh, d: b.dischargeKwh } : {}) });
      assert.equal(split.error, undefined, b.start);
      assert.ok(b.total > 0 && b.varCharges > 0);
    }
  });
}

test('examples: the hybrid covers more than a year and raises the battery efficiency-drop question', () => {
  const s = EXAMPLES.hybrid.setup, bills = exampleBills('hybrid', { climate: lookup(grid, s.lat, s.lon), now });
  assert.equal(bills.length, 14);
  const r = c.efficiencyDrop(bills.map((b) => b.dischargeKwh / b.chargeKwh));
  assert.equal(r.flagged, true);
  assert.ok(s.cost > 0 && s.promisedYears > 0 && s.batteryCost > 0 && s.warrantyPct > 0);
});
