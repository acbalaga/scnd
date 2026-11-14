// Monthly weather-source check (ticket #48, Fred, 14 Nov 2026). Writes public/data/source-status.json.
// Usage: node scripts/source-health.mjs   (behind an HTTP proxy: NODE_USE_ENV_PROXY=1)
// Run by .github/workflows/source-health.yml on the 2nd of each month, which opens a pull request with the new file.
// For each public city point in public/js/cities.js, fetches the same two daily series the app's weather check uses
// (Open-Meteo satellite and NASA POWER, from 2020-01-01), and records for each of the last 13 full months the share of
// days with data and the weather index. No user data: only the fixed city points. Requests run one at a time.
// Exits 1 if a source answered for no city at all, so a dead source fails the run instead of writing an empty file.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CITIES } from '../public/js/cities.js';
import { fetchSatellite, fetchNasa } from '../public/js/weather.js';
import { weatherBaseline, isError } from '../public/js/calc.js';
import { lastMonths, monthStatus } from '../public/js/sources.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'source-status.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);
const months = lastMonths(today);

async function series(fetcher, c) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await fetcher(c.lat, c.lon, { timeoutMs: 60000 }); }
    catch (e) { console.warn(`${c.name}: ${e.message} (attempt ${attempt})`); await sleep(3000 * attempt); }
  }
  return null;
}

const cities = [], answered = { sat: 0, nasa: 0 };
for (const c of CITIES) {
  const row = { name: c.name, lat: c.lat, lon: c.lon };
  for (const [key, fetcher] of [['sat', fetchSatellite], ['nasa', fetchNasa]]) {
    const daily = await series(fetcher, c);
    if (daily) answered[key] += 1;
    const base = daily ? weatherBaseline(daily) : null;
    const st = monthStatus(daily ?? {}, base && !isError(base) ? base : null, months);
    row[key] = st.map((x) => x.share);
    row[key + 'Wi'] = st.map((x) => x.wi);
    await sleep(1000);
  }
  cities.push(row);
  console.log(`${c.name.padEnd(16)} satellite ${row.sat.map((v) => (v >= 0.8 ? '#' : v > 0 ? '+' : '.')).join('')}  NASA ${row.nasa.map((v) => (v >= 0.8 ? '#' : v > 0 ? '+' : '.')).join('')}`);
}

if (!answered.sat || !answered.nasa) {
  console.error(`A source answered for no city (satellite ${answered.sat}, NASA POWER ${answered.nasa} of ${CITIES.length}). Not writing the file.`);
  process.exit(1);
}
const status = {
  built: today,
  note: 'Share of days with data (0 to 1) and weather index per month, for each source at each public city point. Baseline 2020 to 2025. Months oldest first.',
  months, cities,
};
await writeFile(OUT, JSON.stringify(status) + '\n');
console.log(`Wrote ${OUT}: ${months[0]} to ${months.at(-1)}, satellite answered ${answered.sat}, NASA POWER ${answered.nasa} of ${CITIES.length}`);
