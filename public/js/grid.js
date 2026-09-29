// Typical-year irradiance grid lookup. Pure apart from the one static JSON load.
// Grid layout: cell (i, j) is at lat0 + i*step, lon0 + j*step; index = i*nLon + j.
// Values are monthly means, Jan to Dec. GHI and diffuse in kWh/m2/day, T2M in degC.

let cached = null;

export async function loadGrid(url = new URL('../data/ph-grid.json', import.meta.url)) {
  cached ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Grid load failed: HTTP ${r.status}`);
    return r.json();
  });
  return cached;
}

// Bilinear interpolation of the four surrounding cells for one field.
// Returns 12 monthly values, or null if outside the grid or any corner has no data.
export function interpolate(grid, field, lat, lon) {
  const { lat0, lon0, step, nLat, nLon } = grid;
  const fi = (lat - lat0) / step, fj = (lon - lon0) / step;
  if (!(fi >= 0 && fj >= 0 && fi <= nLat - 1 && fj <= nLon - 1)) return null;
  const i = Math.min(Math.floor(fi), nLat - 2), j = Math.min(Math.floor(fj), nLon - 2);
  const ty = fi - i, tx = fj - j;
  const cell = (a, b) => grid[field][a * nLon + b];
  const c = [cell(i, j), cell(i, j + 1), cell(i + 1, j), cell(i + 1, j + 1)];
  if (c.some((x) => !x)) return null;
  const w = [(1 - ty) * (1 - tx), (1 - ty) * tx, ty * (1 - tx), ty * tx];
  return c[0].map((_, m) => c.reduce((s, cv, k) => s + w[k] * cv[m], 0));
}

// { ghi, dif, t2m } monthly arrays for a point, or null outside coverage.
export function lookup(grid, lat, lon) {
  const ghi = interpolate(grid, 'ghi', lat, lon);
  const dif = interpolate(grid, 'dif', lat, lon);
  const t2m = interpolate(grid, 't2m', lat, lon);
  return ghi && dif && t2m ? { ghi, dif, t2m } : null;
}

// Diffuse fraction below this in any month marks a very clear dry-season location.
// Found in the 2001-2020 NASA POWER climatology (built 29 Sep 2026): 42 cell-months (26 cells) in Feb to Apr
// around Mindoro, Panay, northern Palawan and the seas west of Luzon, minimum 0.279. NASA also reads up to ~8% low in the dry season
// (README "Spike 2 result"), so results there should carry a caveat in the UI.
export const LOW_DIFFUSE_FRACTION = 0.3;

// True if any month at this point has a diffuse fraction below LOW_DIFFUSE_FRACTION.
export function isLowDiffuse(point) {
  return point.ghi.some((g, m) => point.dif[m] / g < LOW_DIFFUSE_FRACTION);
}
