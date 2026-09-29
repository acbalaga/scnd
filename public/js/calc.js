// SCND calc core. Pure functions: no DOM, no fetch, no globals. Method: docs/SPEC.md "Calculation method".
// Energy in kWh, irradiation in kWh/m2, power in kW, money in whatever currency the bill uses.
// Functions that can be fed impossible inputs return an error object { error, message } instead of a number.
// Use isError() to test for one.

export const isError = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.error === 'string';
const err = (error, message) => ({ error, message });

const RAD = Math.PI / 180;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Klein (1977) recommended mean day of year for each month.
const MEAN_DAY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
const ALBEDO = 0.2;
const STEP_H = 0.25;
const MIN_COS_ZENITH = Math.cos(85 * RAD); // caps the beam tilt factor near sunrise and sunset

// ---------- F1: plane-of-array irradiation ----------

// Monthly POA irradiation (kWh/m2/month) from monthly mean daily GHI and diffuse (kWh/m2/day).
// Integrates the month's mean day: Collares-Pereira and Rabl (global) and Liu-Jordan (diffuse) hourly
// apportioning, isotropic sky, ground albedo 0.2. azimuth: 0 = south, 90 = west, -90 = east.
// month is 1 to 12. days defaults to the calendar length (Feb = 28).
export function poaMonth({ ghi, dif, tilt, azimuth, lat, month, days }) {
  if (![ghi, dif, tilt, azimuth, lat, month].every(Number.isFinite)) return err('bad_input', 'poaMonth needs numeric ghi, dif, tilt, azimuth, lat and month.');
  if (!(month >= 1 && month <= 12 && Number.isInteger(month))) return err('bad_input', 'month must be 1 to 12.');
  if (ghi < 0 || dif < 0 || dif > ghi) return err('bad_input', 'Need 0 <= diffuse <= GHI.');
  if (tilt < 0 || tilt > 90) return err('bad_input', 'tilt must be 0 to 90 degrees.');
  const nDays = days ?? DAYS_IN_MONTH[month - 1];
  const decl = 23.45 * Math.sin(((360 * (284 + MEAN_DAY[month - 1])) / 365) * RAD) * RAD;
  const phi = lat * RAD, beta = tilt * RAD, gamma = azimuth * RAD;
  const cosWs = -Math.tan(phi) * Math.tan(decl);
  if (cosWs >= 1) return 0;          // polar night
  const ws = cosWs <= -1 ? Math.PI : Math.acos(cosWs);
  const a = 0.409 + 0.5016 * Math.sin(ws - Math.PI / 3);
  const b = 0.6609 - 0.4767 * Math.sin(ws - Math.PI / 3);
  const den = Math.sin(ws) - ws * cosWs;

  const steps = [];
  let sumRt = 0, sumRd = 0;
  for (let h = -(ws * 12) / Math.PI + STEP_H / 2; h < (ws * 12) / Math.PI; h += STEP_H) {
    const w = (h * Math.PI) / 12;
    if (Math.abs(w) >= ws) continue;
    const rt = ((Math.PI / 24) * (a + b * Math.cos(w)) * (Math.cos(w) - cosWs)) / den;
    const rd = ((Math.PI / 24) * (Math.cos(w) - cosWs)) / den;
    steps.push({ w, rt, rd });
    sumRt += rt; sumRd += rd;
  }
  // Normalise so the day's steps sum to the daily value exactly.
  let daily = 0;
  for (const { w, rt, rd } of steps) {
    const i = (rt / sumRt) * ghi, id = (rd / sumRd) * dif;
    const ib = Math.max(i - id, 0);
    const cosZ = Math.sin(decl) * Math.sin(phi) + Math.cos(decl) * Math.cos(phi) * Math.cos(w);
    const cosTheta =
      Math.sin(decl) * Math.sin(phi) * Math.cos(beta) -
      Math.sin(decl) * Math.cos(phi) * Math.sin(beta) * Math.cos(gamma) +
      Math.cos(decl) * Math.cos(phi) * Math.cos(beta) * Math.cos(w) +
      Math.cos(decl) * Math.sin(phi) * Math.sin(beta) * Math.cos(gamma) * Math.cos(w) +
      Math.cos(decl) * Math.sin(beta) * Math.sin(gamma) * Math.sin(w);
    const beam = (ib * Math.max(cosTheta, 0)) / Math.max(cosZ, MIN_COS_ZENITH);
    const sky = id * (1 + Math.cos(beta)) / 2;
    const ground = i * ALBEDO * (1 - Math.cos(beta)) / 2;
    daily += beam + sky + ground;
  }
  return daily * nDays;
}

// ---------- F1: performance ratio and bands ----------

// PR = E_inverter / (kWp x H_POA). Use PV yield, not inverter AC output, for hybrids (F9).
export function performanceRatio({ eKwh, kWp, hPoa }) {
  if (![eKwh, kWp, hPoa].every(Number.isFinite) || eKwh < 0) return err('bad_input', 'Need numeric energy >= 0, kWp and POA irradiation.');
  if (kWp <= 0 || hPoa <= 0) return err('bad_input', 'kWp and POA irradiation must be above zero.');
  return eKwh / (kWp * hPoa);
}

// Expected monthly energy for a given reference PR (typical-year F1 answer).
export function expectedEnergy({ kWp, hPoa, pr }) {
  if (![kWp, hPoa, pr].every(Number.isFinite) || kWp <= 0 || hPoa < 0 || pr <= 0) return err('bad_input', 'Need kWp > 0, POA >= 0 and PR > 0.');
  return kWp * hPoa * pr;
}

// Green >= 0.75 all year. Amber floor is 0.65 in Jun to Oct and 0.62 in Nov to May.
// The lower dry-season floor allows for NASA POWER reading up to ~8% low in the dry season
// (README "Spike 2 result"). Decided by Fred, 29 Sep 2026. Tunable: change here only.
export const PR_BANDS = { green: 0.75, amberWet: 0.65, amberDry: 0.62 };
export const isDrySeason = (month) => month >= 11 || month <= 5;

export function prBand(pr, month) {
  if (!Number.isFinite(pr) || !Number.isInteger(month) || month < 1 || month > 12) return err('bad_input', 'Need a numeric PR and a month 1 to 12.');
  const amber = isDrySeason(month) ? PR_BANDS.amberDry : PR_BANDS.amberWet;
  return pr >= PR_BANDS.green ? 'green' : pr >= amber ? 'amber' : 'red';
}

// Red is raised only after two consecutive red months (satellite monthly irradiance is +/-5 to 10% at a point).
// bands: chronological array of 'green' | 'amber' | 'red', oldest first, one per consecutive month.
export function redFlag(bands) {
  return bands.length >= 2 && bands[bands.length - 1] === 'red' && bands[bands.length - 2] === 'red';
}

// ---------- F4: weather or system ----------

export const weatherIndex = ({ hActual, hTypical }) =>
  Number.isFinite(hActual) && Number.isFinite(hTypical) && hTypical > 0 && hActual >= 0
    ? hActual / hTypical
    : err('bad_input', 'Need hActual >= 0 and hTypical > 0.');

// dE = E_typ(1 - WI) [weather] + (E_typ x WI - E_inverter) [system]. Positive = shortfall.
export function weatherSplit({ eTypical, wi, eActual }) {
  if (![eTypical, wi, eActual].every(Number.isFinite) || eTypical <= 0 || wi < 0 || eActual < 0) return err('bad_input', 'Need eTypical > 0, wi >= 0, eActual >= 0.');
  const weather = eTypical * (1 - wi), system = eTypical * wi - eActual;
  return { weather, system, total: weather + system };
}

// Two weather indices (Himawari ratio, NASA POWER ratio). More than 5 points apart = "uncertain".
export function weatherCall(wiSatellite, wiNasa) {
  if (!Number.isFinite(wiSatellite) || !Number.isFinite(wiNasa)) return err('bad_input', 'Need two numeric weather indices.');
  return { wi: (wiSatellite + wiNasa) / 2, uncertain: Math.abs(wiSatellite - wiNasa) > 0.05 };
}

// ---------- F5: energy split ----------

// G = inverter kWh, X = exported kWh, I = imported kWh, all for the same period.
// S = G - X (used in the house), L = I + S (household load), ratio = S / G.
export function energySplit({ g, x, i }) {
  if (![g, x, i].every(Number.isFinite) || g < 0 || x < 0 || i < 0) return err('bad_input', 'Need G, X and I as numbers >= 0.');
  const s = g - x;
  if (s < 0) return err('period_misalignment', 'Exported kWh is more than generated kWh. The inverter and bill periods probably do not line up.');
  return { selfConsumed: s, load: i + s, selfConsumptionRatio: g > 0 ? s / g : null };
}

// ---------- F6, F7: money ----------

// r_import = the bill's variable charges / I. r_export = the generation charge on the bill (per kWh).
export function importRate({ variableCharges, i }) {
  if (![variableCharges, i].every(Number.isFinite) || variableCharges < 0 || i <= 0) return err('bad_input', 'Need variable charges >= 0 and imported kWh > 0.');
  return variableCharges / i;
}

// Savings = S x r_import + X x r_export.
export function savings({ s, x, rImport, rExport }) {
  if (![s, x, rImport, rExport].every(Number.isFinite) || s < 0 || x < 0) return err('bad_input', 'Need S, X >= 0 and numeric rates.');
  return s * rImport + x * rExport;
}

// Each kWh moved from night to midday is worth r_import - r_export.
export function loadShiftValue({ rImport, rExport }) {
  return Number.isFinite(rImport) && Number.isFinite(rExport) ? rImport - rExport : err('bad_input', 'Need numeric rates.');
}

// ---------- F8: degradation ----------

// records: [{ year, month, pr }] where pr is weather-normalised (computed on actual-month POA).
// Averages the year-over-year loss for each calendar month that has a twin 12 months earlier.
// Returns null until the records span 13 months. warrantyPctPerYear is optional.
export function degradation(records, warrantyPctPerYear) {
  if (!Array.isArray(records) || records.some((r) => !Number.isFinite(r.pr) || r.pr <= 0)) return err('bad_input', 'Need records with pr > 0.');
  const idx = (r) => r.year * 12 + (r.month - 1);
  const byIdx = new Map(records.map((r) => [idx(r), r.pr]));
  const keys = [...byIdx.keys()];
  if (keys.length === 0 || Math.max(...keys) - Math.min(...keys) < 12) return null;
  const losses = [];
  for (const [k, pr] of byIdx) if (byIdx.has(k - 12)) losses.push((1 - pr / byIdx.get(k - 12)) * 100);
  if (losses.length === 0) return null;
  const annualLossPct = losses.reduce((s, v) => s + v, 0) / losses.length;
  return { annualLossPct, pairs: losses.length, exceedsWarranty: Number.isFinite(warrantyPctPerYear) ? annualLossPct > warrantyPctPerYear : null };
}

// ---------- F9: hybrid balance ----------

// L = I + G_pv - X - C + D. Apparent round-trip efficiency = D / C.
// Grid charging flag: battery charge C is more than the PV that was not exported (G_pv - X), so some of it
// must have come from the grid. This is a lower bound: charging that mixes grid and PV is not caught.
export function hybridBalance({ i, gPv, x, c, d }) {
  if (![i, gPv, x, c, d].every(Number.isFinite) || [i, gPv, x, c, d].some((v) => v < 0)) return err('bad_input', 'Need I, G_pv, X, C and D as numbers >= 0.');
  const load = i + gPv - x - c + d;
  if (load < 0) return err('period_misalignment', 'Implied household load is negative. Check that all numbers cover the same period.');
  return { load, roundTripEfficiency: c > 0 ? d / c : null, flags: c > gPv - x ? ['grid_charging'] : [] };
}

// Battery value = D x (r_import - r_export): what each stored kWh earns over exporting it.
export function batteryValue({ d, rImport, rExport }) {
  return Number.isFinite(d) && d >= 0 && Number.isFinite(rImport) && Number.isFinite(rExport) ? d * (rImport - rExport) : err('bad_input', 'Need D >= 0 and numeric rates.');
}

// ---------- Sanity flags ----------

export const CLIPPING_DC_AC = 1.3;

// Returns an array of flag ids: 'clipping', 'no_export_after_activation', 'outage'.
// (S < 0 is not a flag: energySplit returns a period_misalignment error.)
export function sanityFlags({ kWp, acKw, exportKwh, netMeteringActive, outageHours }) {
  const flags = [];
  if (Number.isFinite(kWp) && Number.isFinite(acKw) && acKw > 0 && kWp / acKw > CLIPPING_DC_AC) flags.push('clipping');
  if (netMeteringActive === true && exportKwh === 0) flags.push('no_export_after_activation');
  if (Number.isFinite(outageHours) && outageHours > 0) flags.push('outage');
  return flags;
}
