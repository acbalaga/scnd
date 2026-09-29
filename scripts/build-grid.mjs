// Build public/data/ph-grid.json from NASA POWER climatology (community RE).
// Usage: node scripts/build-grid.mjs
// Node 18+, no dependencies. Raw responses are cached in scripts/.cache/ (gitignored).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'scripts', '.cache');
const OUT = path.join(ROOT, 'public', 'data', 'ph-grid.json');

const LAT0 = 4.5, LAT1 = 21.0, LON0 = 116.5, LON1 = 127.0, STEP = 0.5;
const N_LAT = Math.round((LAT1 - LAT0) / STEP) + 1;
const N_LON = Math.round((LON1 - LON0) / STEP) + 1;
const PARAMS = { ghi: 'ALLSKY_SFC_SW_DWN', dif: 'ALLSKY_SFC_SW_DIFF', t2m: 'T2M' };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DELAY_MS = 2000;

// NASA regional requests are capped at 10 x 10 degrees, so tile with 1 degree overlap.
const TILES = [
  [4.5, 13.5, 116.5, 122.0], [4.5, 13.5, 121.0, 127.0],
  [12.5, 21.0, 116.5, 122.0], [12.5, 21.0, 121.0, 127.0],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(param, [latMin, latMax, lonMin, lonMax]) {
  const key = `${param}_${latMin}_${latMax}_${lonMin}_${lonMax}.json`;
  const file = path.join(CACHE, key);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const url = 'https://power.larc.nasa.gov/api/temporal/climatology/regional?' + new URLSearchParams({
    parameters: param, community: 'RE', format: 'JSON',
    'latitude-min': latMin, 'latitude-max': latMax, 'longitude-min': lonMin, 'longitude-max': lonMax,
  });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      await writeFile(file, JSON.stringify(json));
      await sleep(DELAY_MS);
      return json;
    }
    console.warn(`${key}: HTTP ${res.status}, attempt ${attempt}`);
    await sleep(DELAY_MS * 2 ** attempt);
  }
  throw new Error(`Giving up on ${key}`);
}

// NASA returns points on its own grid (about 0.5 x 0.625 deg), not ours.
// Collect them as {lat, lon, m[12]} and resample below.
function pointsFrom(json, param) {
  const pts = [];
  for (const f of json.features ?? []) {
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties?.parameter?.[param];
    if (!p) continue;
    const m = MONTHS.map((k) => p[k]);
    if (m.some((v) => typeof v !== 'number' || v <= -900)) continue; // -999 fill = ocean / missing
    pts.push({ lat, lon, m });
  }
  return pts;
}

// Inverse-distance weighting over the 4 nearest NASA points.
function resample(pts, lat, lon) {
  const near = pts
    .map((p) => ({ p, d: Math.hypot(p.lat - lat, (p.lon - lon) * Math.cos((lat * Math.PI) / 180)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  if (near[0].d < 1e-6) return near[0].p.m.slice();
  if (near[0].d > 1.0) return null; // nothing within about 100 km: no data here
  const w = near.map((n) => 1 / n.d ** 2);
  const wsum = w.reduce((a, b) => a + b, 0);
  return MONTHS.map((_, i) => near.reduce((s, n, k) => s + w[k] * n.p.m[i], 0) / wsum);
}

const round2 = (v) => Math.round(v * 100) / 100;

async function main() {
  await mkdir(CACHE, { recursive: true });
  const raw = {};
  let period = null;
  for (const [name, param] of Object.entries(PARAMS)) {
    raw[name] = [];
    for (const tile of TILES) {
      const json = await fetchTile(param, tile);
      raw[name].push(...pointsFrom(json, param));
      // Climatology period: not verified against a live response yet, so read defensively.
      if (json.header?.start && json.header?.end) period = `${json.header.start}-${json.header.end}`;
    }
    console.log(`${name}: ${raw[name].length} NASA points`);
  }

  const out = { ghi: [], dif: [], t2m: [] };
  for (let i = 0; i < N_LAT; i++) {
    for (let j = 0; j < N_LON; j++) {
      const lat = LAT0 + i * STEP, lon = LON0 + j * STEP;
      for (const name of Object.keys(PARAMS)) {
        const v = resample(raw[name], lat, lon);
        // Open-sea cells with no NASA point nearby are stored as null (grid.js treats null as no data).
        out[name].push(v ? v.map(round2) : null);
      }
    }
  }

  const grid = {
    meta: {
      source: 'NASA POWER climatology, community RE, regional endpoint, resampled by inverse-distance weighting',
      parameters: { ghi: 'ALLSKY_SFC_SW_DWN kWh/m2/day', dif: 'ALLSKY_SFC_SW_DIFF kWh/m2/day', t2m: 'T2M degC' },
      period: period ?? 'unknown (check raw cache header)',
      built: new Date().toISOString().slice(0, 10),
      step: STEP,
    },
    lat0: LAT0, lon0: LON0, step: STEP, nLat: N_LAT, nLon: N_LON,
    ghi: out.ghi, dif: out.dif, t2m: out.t2m,
  };
  const text = JSON.stringify(grid);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, text);
  console.log(`Wrote ${OUT}: ${(text.length / 1024).toFixed(1)} KB, period ${grid.meta.period}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
