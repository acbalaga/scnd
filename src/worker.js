// SCND Worker. Static assets are served before this script runs; the script
// only sees paths that are not files in /public.
//
// /api/pvgis: spike-only proxy to PVGIS MRcalc, because PVGIS refuses browser
// (AJAX/CORS) calls. Restricted to Philippine coordinates and cached for a week.

const PH = { latMin: 4.0, latMax: 21.5, lonMin: 116.0, lonMax: 127.5 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/pvgis') {
      return pvgis(url, ctx);
    }
    if (url.pathname === '/api/gsa') {
      return gsa(url, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

// /api/gsa: spike-only proxy to Global Solar Atlas long-term averages
// (Solargis model, CC BY 4.0). Used as the independent climatology reference
// because PVGIS SARAH-3 does not cover the Philippines.
async function gsa(url, ctx) {
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!inPH(lat, lon)) return json({ error: 'Coordinates must be in the Philippines.' }, 400);

  const upstream = `https://api.globalsolaratlas.info/data/lta?loc=${lat.toFixed(3)},${lon.toFixed(3)}`;
  return cachedFetch(upstream, ctx);
}

function inPH(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= PH.latMin && lat <= PH.latMax && lon >= PH.lonMin && lon <= PH.lonMax;
}

async function cachedFetch(upstream, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(upstream);
  const hit = await cache.match(cacheKey);
  if (hit) return withHeaders(hit, 'HIT');

  const res = await fetch(upstream, {
    headers: {
      accept: 'application/json',
      'user-agent': 'SCND/0.1 (+https://github.com/acbalaga/scnd; irradiance validation spike)',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    return json({ error: `Upstream returned HTTP ${res.status}`, detail: text.slice(0, 500) }, 502);
  }
  const out = new Response(await res.text(), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=604800' },
  });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return withHeaders(out, 'MISS');
}

async function pvgis(url, ctx) {
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const startyear = Number(url.searchParams.get('startyear') ?? 2020);
  const endyear = Number(url.searchParams.get('endyear') ?? 2023);

  const valid =
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= PH.latMin && lat <= PH.latMax &&
    lon >= PH.lonMin && lon <= PH.lonMax &&
    Number.isInteger(startyear) && Number.isInteger(endyear) &&
    startyear >= 2005 && endyear <= 2023 && startyear <= endyear;

  if (!valid) {
    return json({ error: 'Coordinates must be in the Philippines; years 2005 to 2023.' }, 400);
  }

  const upstream = new URL('https://re.jrc.ec.europa.eu/api/v5_3/MRcalc');
  upstream.search = new URLSearchParams({
    lat: lat.toFixed(2),
    lon: lon.toFixed(2),
    horirrad: '1',
    raddatabase: 'PVGIS-SARAH3',
    startyear: String(startyear),
    endyear: String(endyear),
    outputformat: 'json',
  }).toString();

  const cache = caches.default;
  const cacheKey = new Request(upstream.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return withHeaders(hit, 'HIT');

  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(upstream.toString(), {
      headers: {
        accept: 'application/json',
        'user-agent': 'SCND/0.1 (+https://github.com/acbalaga/scnd; irradiance validation spike)',
      },
    });
    if (res.status !== 429 && res.status !== 529) break;
    await new Promise(r => setTimeout(r, 1500));
  }

  if (!res.ok) {
    const text = await res.text();
    return json({ error: `PVGIS returned HTTP ${res.status}`, detail: text.slice(0, 500) }, 502);
  }

  const body = await res.text();
  const out = new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=604800',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return withHeaders(out, 'MISS');
}

function withHeaders(res, cacheState) {
  const r = new Response(res.body, res);
  r.headers.set('x-scnd-cache', cacheState);
  return r;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
