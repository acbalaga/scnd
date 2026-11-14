// Build public/data/ph-grid.json from NASA POWER climatology (community RE).
// Usage: node scripts/build-grid.mjs
// Behind an HTTP proxy, run with NODE_USE_ENV_PROXY=1 so fetch honours HTTPS_PROXY.
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

// Grid nodes that take only NASA's inland cells for sun data (ticket #38, decided by Fred 14 Nov 2026). NASA POWER solar
// data is natively 1 degree (CERES SYN1deg, cell centres on the half degrees), and Metro Manila sits on the edge between
// the cell centred on 120.5 E (mostly Manila Bay and Bataan) and the one on 121.5 E (inland). Against Global Solar Atlas
// at 14.6, 121.0 (test/fixtures-gsa.mjs) the bay cell reads 10 to 23% high from October to March and the inland cell is
// within 5% in every month, so any blend of the two read Manila too sunny (+5 to +10% Sep to Apr, about 4% a year).
// These nodes take the nearest inland NASA cell (centre on lon + 0.5, the 121.5 E column), or the mean of two equally
// near, with no wider blend: blending in the cells north and south as well put Manila at +5.4% in September.
// Sun fields only: temperature (MERRA-2) is on a finer grid and is not affected.
const INLAND_NODES = [{ lat: 14.5, lon: 121.0 }, { lat: 15.0, lon: 121.0 }];
const SUN_FIELDS = new Set(['ghi', 'dif']);
const inland = (lat, lon) => INLAND_NODES.some((n) => n.lat === lat && n.lon === lon);
function nearestInland(pts, lat, lon) {
  const col = pts.filter((p) => Math.abs(p.lon - (lon + 0.5)) < 1e-6);
  const d = (p) => Math.abs(p.lat - lat), dMin = Math.min(...col.map(d));
  const near = col.filter((p) => d(p) - dMin < 1e-6);
  return MONTHS.map((_, i) => near.reduce((s, p) => s + p.m[i], 0) / near.length);
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
        const v = SUN_FIELDS.has(name) && inland(lat, lon) ? nearestInland(raw[name], lat, lon) : resample(raw[name], lat, lon);
        // Open-sea cells with no NASA point nearby are stored as null (grid.js treats null as no data).
        out[name].push(v ? v.map(round2) : null);
      }
    }
  }

  const grid = {
    meta: {
      source: 'NASA POWER climatology, community RE, regional endpoint, resampled by inverse-distance weighting',
      inlandNodes: 'Sun data at ' + INLAND_NODES.map((n) => `${n.lat}, ${n.lon}`).join(' and ') + ' uses only the NASA inland cells on ' + (INLAND_NODES[0].lon + 0.5) + ' E (Metro Manila, ticket #38)',
      parameters: { ghi: 'ALLSKY_SFC_SW_DWN kWh/m2/day', dif: 'ALLSKY_SFC_SW_DIFF kWh/m2/day', t2m: 'T2M degC' },
      // As NASA's response header states it. The 14 Nov 2026 rebuild read 20010101-20251231 while every value matched the
      // 29 Sep 2026 build, which had recorded 20010101-20201231 (noted for Fred in docs/NEXT.md, ticket #38).
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
