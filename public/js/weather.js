// Actual-month weather data for F4. The only outbound calls the app makes, and only when the user asks.
// Each call sends the location rounded to 0.1 degree and a date range, nothing else.
//   Himawari satellite: Open-Meteo satellite API (5 km), daily GHI in MJ/m2, converted to kWh/m2.
//   NASA POWER: daily all-sky GHI in kWh/m2, -999 = missing.
// Both return { 'YYYY-MM-DD': kWh/m2/day | null } from 2020-01-01 (the baseline start) to yesterday.
// No DOM here. fetch is a parameter (the browser's by default) so tests can stand in for the network.
import { BASELINE_FROM } from './calc.js';

// Each response is about 45 KB; the live check in the pre-launch audit (2 Oct 2026) took about 9 s for both. A source that
// has not answered by this time counts as failed, so the other can still give a result (ticket #42).
export const WEATHER_TIMEOUT_MS = 30000;

export const SOURCE_LABELS = { sat: 'Satellite (Himawari)', nasa: 'NASA POWER' };

// kind: 'unreachable' (no answer at all), 'timeout', 'http' (answered with an error) or 'shape' (answered with data
// SCND could not read). message is plain English for the owner.
export class WeatherError extends Error {
  constructor(kind, message) { super(message); this.name = 'WeatherError'; this.kind = kind; }
}

const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const isTimeout = (e) => e?.name === 'TimeoutError' || e?.name === 'AbortError';

async function getJson(url, label, { fetchFn = globalThis.fetch, timeoutMs = WEATHER_TIMEOUT_MS } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);   // also covers reading the body
  const tooSlow = () => new WeatherError('timeout', `${label} took too long to answer.`);
  let res;
  try {
    res = await fetchFn(url, { signal });
  } catch (e) {
    throw isTimeout(e) || signal.aborted ? tooSlow() : new WeatherError('unreachable', `${label} could not be reached.`);
  }
  if (!res.ok) throw new WeatherError('http', `${label} answered with an error (HTTP ${res.status}).`);
  try {
    return await res.json();
  } catch (e) {
    throw isTimeout(e) || signal.aborted ? tooSlow() : new WeatherError('shape', `${label} answered with data SCND could not read.`);
  }
}

const badShape = (label) => new WeatherError('shape', `${label} answered with data SCND could not read.`);

// Open-Meteo satellite response to { date: kWh/m2/day | null }. MJ/m2 / 3.6 = kWh/m2.
export function parseSatellite(j) {
  const t = j?.daily?.time, v = j?.daily?.shortwave_radiation_sum;
  if (!Array.isArray(t) || !Array.isArray(v) || t.length !== v.length) throw badShape(SOURCE_LABELS.sat);
  const out = {};
  t.forEach((d, i) => { out[d] = Number.isFinite(v[i]) ? v[i] / 3.6 : null; });
  return out;
}

// NASA POWER response to { date: kWh/m2/day | null }. Keys come as YYYYMMDD; -999 marks a missing day.
export function parseNasa(j) {
  const p = j?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw badShape(SOURCE_LABELS.nasa);
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (!/^\d{8}$/.test(k)) continue;
    out[`${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`] = Number.isFinite(v) && v > -900 ? v : null;
  }
  return out;
}

export async function fetchSatellite(lat, lon, opts) {
  const url = 'https://satellite-api.open-meteo.com/v1/archive?' + new URLSearchParams({
    latitude: lat, longitude: lon, start_date: BASELINE_FROM, end_date: yesterday(),
    daily: 'shortwave_radiation_sum', models: 'satellite_radiation_seamless', timezone: 'Asia/Manila',
  });
  return parseSatellite(await getJson(url, SOURCE_LABELS.sat, opts));
}

export async function fetchNasa(lat, lon, opts) {
  const compact = (iso) => iso.replaceAll('-', '');
  const url = 'https://power.larc.nasa.gov/api/temporal/daily/point?' + new URLSearchParams({
    parameters: 'ALLSKY_SFC_SW_DWN', community: 'RE', latitude: lat, longitude: lon,
    start: compact(BASELINE_FROM), end: compact(yesterday()), format: 'JSON',
  });
  return parseNasa(await getJson(url, SOURCE_LABELS.nasa, opts));
}
