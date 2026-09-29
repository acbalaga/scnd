import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, parse } from '../public/js/data.js';

const setup = { lat: 14.6, lon: 121, kWp: 5.5, acKw: 5, tilt: 10, azimuth: 0, commissioned: '2025-06', hybrid: false, netMetering: true, cost: 300000, promisedYears: 6, place: 'Manila', junk: 'x' };
const bills = [{ id: 7, start: '2026-01-15', end: '2026-02-14', inverterKwh: 560, importKwh: 300, exportKwh: 220, genRate: 9.7, varCharges: 3600, total: 2100, outageHours: '', extra: 'y' }];

test('serialize then parse round-trips setup and bills, dropping unknown fields and ids', () => {
  const r = parse(serialize(setup, bills, new Date('2026-09-29')));
  assert.equal(r.error, undefined);
  assert.equal(r.setup.kWp, 5.5); assert.equal(r.setup.commissioned, '2025-06'); assert.equal(r.setup.netMetering, true);
  assert.equal(r.setup.junk, undefined); assert.equal(r.bills[0].id, undefined); assert.equal(r.bills[0].extra, undefined);
  assert.equal(r.bills[0].exportKwh, 220); assert.equal(r.bills[0].outageHours, '');
});
test('serialize records the format, version and save date and nothing about an installer', () => {
  const j = JSON.parse(serialize(setup, bills, new Date('2026-09-29')));
  assert.deepEqual([j.format, j.version, j.saved], ['scnd', 1, '2026-09-29']);
  assert.ok(!/installer/i.test(JSON.stringify(j)));
});
test('parse rejects non-JSON, wrong format, wrong version and missing parts', () => {
  assert.match(parse('not json').error, /not valid JSON/);
  assert.match(parse('{"format":"other"}').error, /not a SCND/);
  assert.match(parse('{"format":"scnd","version":2,"setup":{},"bills":[]}').error, /version 2/);
  assert.match(parse('{"format":"scnd","version":1}').error, /missing/);
});
test('parse rejects text in number fields, bad dates and too many bills', () => {
  const base = JSON.parse(serialize(setup, bills));
  assert.match(parse(JSON.stringify({ ...base, setup: { ...base.setup, kWp: '5.5abc' } })).error, /kWp/);
  assert.match(parse(JSON.stringify({ ...base, bills: [{ ...base.bills[0], start: '15/01/2026' }] })).error, /start/);
  assert.match(parse(JSON.stringify({ ...base, bills: Array(61).fill(base.bills[0]) })).error, /at most/);
  assert.match(parse('x'.repeat(1_000_001)).error, /too large/);
});
