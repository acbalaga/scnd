// Weather fetch and parse (ticket #42). The network is stood in for by a fetch stub: no real call is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSatellite, fetchNasa, parseSatellite, parseNasa, WeatherError } from '../public/js/weather.js';

const json = (body, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
// Never answers, but gives up when the caller's signal aborts, as the browser's fetch does. Node does not keep the process
// alive for AbortSignal.timeout's timer, so a held timer stands in for the open connection a real fetch would keep.
const hang = async (_url, { signal }) => new Promise((_, reject) => {
  const open = setTimeout(() => reject(new Error('stub never aborted')), 5000);
  signal.addEventListener('abort', () => { clearTimeout(open); reject(signal.reason); });
});
const kindOf = async (p) => { try { await p; return 'ok'; } catch (e) { assert.ok(e instanceof WeatherError, e); return e.kind; } };

const SAT = { daily: { time: ['2026-01-01', '2026-01-02', '2026-01-03'], shortwave_radiation_sum: [18, null, 3.6] } };
const NASA = { properties: { parameter: { ALLSKY_SFC_SW_DWN: { 20260101: 5.2, 20260102: -999, 20260103: 0 } } } };

test('weather golden: satellite MJ/m2 becomes kWh/m2, nulls stay null', () => {
  assert.deepEqual(parseSatellite(SAT), { '2026-01-01': 5, '2026-01-02': null, '2026-01-03': 1 });
});

test('weather golden: NASA POWER keys become ISO dates and -999 becomes null', () => {
  assert.deepEqual(parseNasa(NASA), { '2026-01-01': 5.2, '2026-01-02': null, '2026-01-03': 0 });
});

test('weather golden: a good answer goes through fetch and parse, and only the rounded point is sent', async () => {
  const urls = [];
  const spy = (body) => async (url, opts) => { urls.push(url); assert.ok(opts.signal); return json(body)(); };
  assert.equal((await fetchSatellite(14.6, 121, { fetchFn: spy(SAT) }))['2026-01-01'], 5);
  assert.equal((await fetchNasa(14.6, 121, { fetchFn: spy(NASA) }))['2026-01-01'], 5.2);
  for (const u of urls) {
    const q = new URL(u).searchParams;
    assert.equal(q.get('latitude'), '14.6');
    assert.equal(q.get('longitude'), '121');
  }
});

test('weather edge: a source that never answers times out instead of hanging', async () => {
  const t0 = Date.now();
  assert.equal(await kindOf(fetchSatellite(14.6, 121, { fetchFn: hang, timeoutMs: 50 })), 'timeout');
  assert.equal(await kindOf(fetchNasa(14.6, 121, { fetchFn: hang, timeoutMs: 50 })), 'timeout');
  assert.ok(Date.now() - t0 < 2000);
});

test('weather edge: no connection, HTTP error and unreadable data are told apart', async () => {
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await kindOf(fetchNasa(14.6, 121, { fetchFn: offline })), 'unreachable');
  assert.equal(await kindOf(fetchNasa(14.6, 121, { fetchFn: json({}, 500) })), 'http');
  assert.equal(await kindOf(fetchNasa(14.6, 121, { fetchFn: json({ properties: {} }) })), 'shape');
  assert.equal(await kindOf(fetchSatellite(14.6, 121, { fetchFn: json({ daily: { time: ['2026-01-01'], shortwave_radiation_sum: [] } }) })), 'shape');
  const notJson = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  assert.equal(await kindOf(fetchSatellite(14.6, 121, { fetchFn: notJson })), 'shape');
});

test('weather edge: error messages are plain English and name the source', async () => {
  try { await fetchSatellite(14.6, 121, { fetchFn: hang, timeoutMs: 20 }); assert.fail('should throw'); }
  catch (e) { assert.equal(e.message, 'Satellite (Himawari) took too long to answer.'); }
  try { await fetchNasa(14.6, 121, { fetchFn: json({}, 503) }); assert.fail('should throw'); }
  catch (e) { assert.equal(e.message, 'NASA POWER answered with an error (HTTP 503).'); assert.doesNotMatch(e.message, /—/); }
});
