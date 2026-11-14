// Weather-source health (ticket #48, Fred, 14 Nov 2026). Pure: no DOM, no fetch.
// scripts/source-health.mjs runs monthly (GitHub Actions) and writes public/data/source-status.json: for each city in
// cities.js and each of the last 13 full months, the share of days each source has data for, and each source's weather
// index. The app reads it before "Check the weather" to say where the check will rest on one source. No user data is
// involved anywhere: the points are the public city list.
import { weatherIndexPeriod } from './calc.js';

export const COVERAGE_OK = 0.8;   // same share of valid days that calc.weatherIndexPeriod needs (MIN_COVERAGE)

// The n full calendar months before `today` (YYYY-MM-DD), oldest first, as 'YYYY-MM'.
export function lastMonths(today, n = 13) {
  const t = new Date(Date.parse(today)), out = [];
  for (let k = n; k >= 1; k--) {
    const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - k, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

// For one source at one point: { share, wi } per month. share is valid days / days in the month (2 decimals); wi is the
// weather index for the month against the source's own baseline, or null when under COVERAGE_OK or no baseline.
export function monthStatus(daily, baseline, months) {
  return months.map((ym) => {
    const [y, m] = ym.split('-').map(Number);
    const start = `${ym}-01`, end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
    let valid = 0;
    for (let k = 0; k < days; k++) if (Number.isFinite(daily?.[new Date(Date.parse(start) + k * 86400000).toISOString().slice(0, 10)])) valid += 1;
    const r = Array.isArray(baseline) ? weatherIndexPeriod({ daily, baseline, start, end }) : null;
    return { share: Math.round((valid / days) * 100) / 100, wi: r && Number.isFinite(r.wi) ? Math.round(r.wi * 1000) / 1000 : null };
  });
}

// Nearest city in the status file to a point (flat-earth distance is fine at this scale).
export function nearestStatus(status, lat, lon) {
  if (!status?.cities?.length || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const d = (c) => Math.hypot(c.lat - lat, (c.lon - lon) * Math.cos((lat * Math.PI) / 180));
  return status.cities.reduce((a, c) => (d(c) < d(a) ? c : a));
}

// Months (from `wanted`, 'YYYY-MM') in which the satellite had too few days at the nearest city, so the weather check
// for bills in those months will rest on NASA POWER alone. Months the file does not cover are left out.
export function satelliteGaps(status, lat, lon, wanted) {
  const c = nearestStatus(status, lat, lon);
  if (!c) return { city: null, months: [] };
  const months = [...new Set(wanted)].filter((ym) => {
    const k = status.months.indexOf(ym);
    return k >= 0 && !(c.sat[k] >= COVERAGE_OK);
  }).sort();
  return { city: c.name, months };
}
