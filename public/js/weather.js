// Actual-month weather data for F4. The only outbound calls the app makes, and only when the user asks.
// Each call sends the location rounded to 0.1 degree and a date range, nothing else.
//   Himawari satellite: Open-Meteo satellite API (5 km), daily GHI in MJ/m2, converted to kWh/m2.
//   NASA POWER: daily all-sky GHI in kWh/m2, -999 = missing.
// Both return { 'YYYY-MM-DD': kWh/m2/day | null } from 2020-01-01 (the baseline start) to yesterday.
import { BASELINE_FROM } from './calc.js';

const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export async function fetchSatellite(lat, lon) {
  const url = 'https://satellite-api.open-meteo.com/v1/archive?' + new URLSearchParams({
    latitude: lat, longitude: lon, start_date: BASELINE_FROM, end_date: yesterday(),
    daily: 'shortwave_radiation_sum', models: 'satellite_radiation_seamless', timezone: 'Asia/Manila',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Satellite data: HTTP ${res.status}`);
  const j = await res.json();
  const out = {};
  j.daily.time.forEach((d, i) => { const v = j.daily.shortwave_radiation_sum[i]; out[d] = Number.isFinite(v) ? v / 3.6 : null; });
  return out;
}

export async function fetchNasa(lat, lon) {
  const compact = (iso) => iso.replaceAll('-', '');
  const url = 'https://power.larc.nasa.gov/api/temporal/daily/point?' + new URLSearchParams({
    parameters: 'ALLSKY_SFC_SW_DWN', community: 'RE', latitude: lat, longitude: lon,
    start: compact(BASELINE_FROM), end: compact(yesterday()), format: 'JSON',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER: HTTP ${res.status}`);
  const j = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(j.properties.parameter.ALLSKY_SFC_SW_DWN)) {
    out[`${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`] = v > -900 ? v : null;
  }
  return out;
}
