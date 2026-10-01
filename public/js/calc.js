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

// Bills run reading date to reading date, not calendar month. Splits the days from start (included)
// to end (excluded) into calendar months. Dates are 'YYYY-MM-DD'. Periods over 62 days are rejected.
export function splitPeriod(start, end) {
  const t0 = Date.parse(start), t1 = Date.parse(end);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return err('bad_input', 'Need two valid dates.');
  const n = Math.round((t1 - t0) / 86400000);
  if (n <= 0) return err('bad_period', 'The end reading date must be after the start.');
  if (n > 62) return err('bad_period', 'A bill period is normally 25 to 35 days. This one is over 62.');
  const parts = [];
  for (let k = 0; k < n; k++) {
    const d = new Date(t0 + k * 86400000);
    const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1;
    const last = parts[parts.length - 1];
    if (last && last.year === year && last.month === month) last.days += 1;
    else parts.push({ year, month, days: 1 });
  }
  return parts;
}

// POA irradiation over a bill period: each calendar month's mean day, weighted by the days it covers.
// ghi and dif are the 12 monthly means (kWh/m2/day). midMonth is the month holding the period's midpoint,
// used to pick the wet or dry PR band. midYear is the year of that midpoint (F8 pairs bills by month and year).
export function poaPeriod({ ghi, dif, tilt, azimuth, lat, start, end }) {
  const parts = splitPeriod(start, end);
  if (isError(parts)) return parts;
  let hPoa = 0, days = 0;
  for (const { month, days: d } of parts) {
    const h = poaMonth({ ghi: ghi[month - 1], dif: dif[month - 1], tilt, azimuth, lat, month, days: d });
    if (isError(h)) return h;
    hPoa += h; days += d;
  }
  const mid = new Date(Date.parse(start) + (days / 2) * 86400000);
  return { hPoa, days, midMonth: mid.getUTCMonth() + 1, midYear: mid.getUTCFullYear() };
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

// Which PR a bill is judged on (Fred, 30 Sep 2026, docs/NEXT.md task 11). Once the weather check gives a call that
// is not "uncertain", the bill is judged on weather-adjusted PR, so a cloudy month does not read as a fault. With no
// call, or an uncertain one, it stays against a typical year. An inferred call (one source) is used: it is labelled.
// pr and expectedKwh are the typical-year values; call is weatherCall's result or null.
// Returns { pr, expectedKwh, basis: 'weather' | 'typical' }. Adjusted PR = pr / WI (same as PR on H_POA x WI).
export function judgedPr({ pr, expectedKwh, call }) {
  if (!Number.isFinite(pr) || !Number.isFinite(expectedKwh)) return err('bad_input', 'Need a numeric PR and expected energy.');
  if (!call || call.uncertain || !Number.isFinite(call.wi) || call.wi <= 0) return { pr, expectedKwh, basis: 'typical' };
  return { pr: pr / call.wi, expectedKwh: expectedKwh * call.wi, basis: 'weather' };
}

// Two bills count as back to back when the second starts within this many days of the first one's end
// (Fred, 30 Sep 2026). Reading dates can shift by a few days; a skipped month cannot.
export const CONSECUTIVE_GAP_DAYS = 7;
export function isConsecutive(prev, next) {
  const t0 = Date.parse(prev?.end), t1 = Date.parse(next?.start);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return false;
  return Math.abs(t1 - t0) / 86400000 <= CONSECUTIVE_GAP_DAYS;
}

// Gaps between bills: oldest first, a gap wherever the next bill starts more than CONSECUTIVE_GAP_DAYS after the
// previous one ends. Bills without both dates are skipped. Returns [{ from, to, days }] (from = previous end,
// to = next start). Red-flag and payback logic do not change across a gap; the UI only says it is there.
export function billGaps(bills) {
  const dated = bills.filter((b) => Number.isFinite(Date.parse(b?.start)) && Number.isFinite(Date.parse(b?.end)))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const gaps = [];
  for (let k = 1; k < dated.length; k++) {
    const days = (Date.parse(dated[k].start) - Date.parse(dated[k - 1].end)) / 86400000;
    if (days > CONSECUTIVE_GAP_DAYS) gaps.push({ from: dated[k - 1].end, to: dated[k].start, days });
  }
  return gaps;
}

// Days two bill periods share. Periods run start (included) to end (excluded), so a bill that starts on the
// previous one's end date shares 0 days.
export function overlapDays(a, b) {
  const s = Math.max(Date.parse(a.start), Date.parse(b.start)), e = Math.min(Date.parse(a.end), Date.parse(b.end));
  if (![s, e].every(Number.isFinite)) return 0;
  return Math.max(Math.round((e - s) / 86400000), 0);
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

// Climatology window for the weather index. Decided by Fred, 29 Sep 2026, after the Himawari history check
// (docs/NEXT.md task 5): 2020 to 2025 overlaps the spike 2 window and carries less of the satellite series'
// downward drift than 2016 to 2025. The NASA POWER index uses the same window for its own baseline so the
// two indices are comparable.
export const BASELINE_FROM = '2020-01-01';
export const BASELINE_TO = '2025-12-31';
const MIN_BASELINE_DAYS = 100;   // valid days needed in a calendar month over the six years
const MIN_COVERAGE = 0.8;        // share of a bill period that needs valid daily data

// daily: { 'YYYY-MM-DD': kWh/m2/day or null }. Returns 12 monthly mean GHI values over the baseline window,
// or an error object if any month has too few valid days.
export function weatherBaseline(daily) {
  const sum = Array(12).fill(0), n = Array(12).fill(0);
  for (const [date, v] of Object.entries(daily ?? {})) {
    if (date < BASELINE_FROM || date > BASELINE_TO || !Number.isFinite(v)) continue;
    const m = Number(date.slice(5, 7)) - 1;
    sum[m] += v; n[m] += 1;
  }
  if (n.some((k) => k < MIN_BASELINE_DAYS)) return err('no_baseline', 'Not enough history to build a typical month from this source.');
  return sum.map((t, m) => t / n[m]);
}

// Weather index for one bill period from one source: mean actual daily GHI over the days that have data,
// divided by the baseline for the same days. Returns { wi, days, validDays }, or null when fewer than 80% of the
// period's days have data (the caller treats that source as missing).
// Approximation: the index is on GHI and is applied to POA. Actual diffuse is not available per period.
export function weatherIndexPeriod({ daily, baseline, start, end }) {
  const t0 = Date.parse(start), t1 = Date.parse(end);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return err('bad_period', 'Need a valid start and end date.');
  if (!Array.isArray(baseline) || baseline.length !== 12) return err('no_baseline', 'Need a 12-month baseline.');
  const days = Math.round((t1 - t0) / 86400000);
  let actual = 0, base = 0, validDays = 0;
  for (let k = 0; k < days; k++) {
    const date = new Date(t0 + k * 86400000).toISOString().slice(0, 10);
    const v = daily?.[date];
    if (!Number.isFinite(v)) continue;
    actual += v; base += baseline[Number(date.slice(5, 7)) - 1]; validDays += 1;
  }
  if (validDays < days * MIN_COVERAGE) return null;
  return { wi: actual / base, days, validDays };
}

// Combines the two weather indices (Himawari ratio, NASA POWER ratio). Pass null for a source with no data.
//  both: wi is the mean; uncertain if they are more than 5 points apart.
//  one:  wi is that source alone, inferred = true (nothing to cross-check it against).
//  none: returns null (typical-year only).
export function weatherCall(wiSatellite, wiNasa) {
  const has = (v) => v !== null && v !== undefined;
  if ((has(wiSatellite) && !Number.isFinite(wiSatellite)) || (has(wiNasa) && !Number.isFinite(wiNasa))) return err('bad_input', 'Weather indices must be numbers or null.');
  if (has(wiSatellite) && has(wiNasa)) return { wi: (wiSatellite + wiNasa) / 2, uncertain: Math.abs(wiSatellite - wiNasa) > 0.05, source: 'both', inferred: false };
  if (has(wiSatellite)) return { wi: wiSatellite, uncertain: false, source: 'satellite', inferred: true };
  if (has(wiNasa)) return { wi: wiNasa, uncertain: false, source: 'nasa', inferred: true };
  return null;
}

// ---------- F5: energy split ----------

// G = inverter kWh (PV yield for hybrids), X = exported kWh, I = imported kWh, all for the same period.
// S = G - X (used in the house), L = I + S (household load), ratio = S / G.
// Hybrids pass C (battery charge) and D (battery discharge): S = G - X - C + D, so battery losses are not counted
// as solar used, and L = I + S matches hybridBalance (F9). Without this, savings overstate by (C - D) x r_import.
export function energySplit({ g, x, i, c, d }) {
  if (![g, x, i].every(Number.isFinite) || g < 0 || x < 0 || i < 0) return err('bad_input', 'Need G, X and I as numbers >= 0.');
  const battery = c !== undefined || d !== undefined;
  if (battery && (![c, d].every(Number.isFinite) || c < 0 || d < 0)) return err('bad_input', 'Need battery charge and discharge as numbers >= 0.');
  if (g - x < 0) return err('period_misalignment', 'Exported kWh is more than generated kWh. The inverter and bill periods probably do not line up.');
  const s = battery ? g - x - c + d : g - x;
  if (s < 0) return err('period_misalignment', 'Solar used in the house works out below zero. Check that the battery numbers cover the same dates as the bill.');
  return { selfConsumed: s, load: i + s, selfConsumptionRatio: g > 0 ? s / g : null };
}

// ---------- F6, F7: money ----------

// r_import = the bill's variable charges / I. r_export = the generation charge on the bill (per kWh).
export function importRate({ variableCharges, i }) {
  if (![variableCharges, i].every(Number.isFinite) || variableCharges < 0 || i <= 0) return err('bad_input', 'Need variable charges >= 0 and imported kWh > 0.');
  return variableCharges / i;
}

// Savings = S x r_import + export credit, where the credit is X x r_export capped at creditCap (the bill's variable
// charges). Credit above the variable charges does not lower this bill, and how it carries over is not verified
// (see billDecode), so it is not counted. Decided by Fred, 1 Oct 2026. Without creditCap the credit is uncapped.
export function savings({ s, x, rImport, rExport, creditCap }) {
  if (![s, x, rImport, rExport].every(Number.isFinite) || s < 0 || x < 0) return err('bad_input', 'Need S, X >= 0 and numeric rates.');
  const credit = x * rExport, cap = Number.isFinite(creditCap) && creditCap >= 0 ? creditCap : Infinity;
  return s * rImport + Math.min(credit, cap);
}
// Export credit left out of savings by the cap (0 when the credit fits inside the variable charges).
export function uncountedCredit({ x, rExport, creditCap }) {
  return Number.isFinite(creditCap) && [x, rExport].every(Number.isFinite) ? Math.max(x * rExport - creditCap, 0) : 0;
}

// ---------- F2: bill decoder ----------

// Walks one net-metered bill from the user's own numbers. Returns the amounts the UI narrates:
//   rImport       average buying rate, variable charges / imported kWh
//   exportCredit  X x generation charge
//   afterCredit   variable charges minus credit, floored at 0
//   other         total minus afterCredit: fixed charges, taxes and anything not in "variable charges"
//   coverage      share of variable charges the credit offsets (null if variable charges are 0)
//   exportGap     rImport - genRate: what a kWh used at home earns over a kWh exported
//   excess        credit above the variable charges (0 unless credit_exceeds_variable); not modelled, only shown
//   noFixed       true when the total equals what is left after the credit (within rounding): nothing is left for
//                 fixed charges, which usually means they were included in the variable charges entered
// Bills print to the centavo but owners round, so totals within ROUND_PHP of the worked-out figure count as matching.
// Claims behind it (docs/SPEC.md, sources dated 29 Sep 2026: Lakasolar "rebate vs net metering",
// SolarPro Install "reading the net-metered Meralco bill"): exports are credited at the generation
// charge, not the retail rate; fixed charges do not shrink with solar, so the bill stays above zero.
// Not verified: how a credit larger than the variable charges is carried over. We flag it, not model it.
export const ROUND_PHP = 0.5;
export function billDecode({ importKwh, exportKwh, genRate, varCharges, total }) {
  if (![importKwh, exportKwh, genRate, varCharges, total].every(Number.isFinite) || [importKwh, exportKwh, genRate, varCharges, total].some((v) => v < 0)) {
    return err('bad_input', 'Need import kWh, export kWh, generation charge, variable charges and total as numbers >= 0.');
  }
  if (importKwh <= 0) return err('bad_input', 'Imported kWh must be above zero to work out your buying rate.');
  const rImport = varCharges / importKwh;
  const exportCredit = exportKwh * genRate;
  const raw = varCharges - exportCredit;
  const afterCredit = Math.max(raw, 0);
  const other = total - afterCredit;
  const flags = [];
  if (genRate > rImport) flags.push('gen_above_buy');
  if (raw < 0) flags.push('credit_exceeds_variable');
  if (other < -ROUND_PHP) flags.push('total_below_charges');
  return { rImport, exportCredit, afterCredit, other, excess: Math.max(-raw, 0), noFixed: Math.abs(other) <= ROUND_PHP,
    coverage: varCharges > 0 ? exportCredit / varCharges : null, exportGap: rImport - genRate, flags };
}

// Payback tracker (F6). The installer's promise is a straight line: cost spread evenly over the promised years.
// promisedSavings: what would have been saved after `days` at that pace.
export function promisedSavings({ cost, years, days }) {
  if (![cost, years, days].every(Number.isFinite) || cost <= 0 || years <= 0 || days < 0) return err('bad_input', 'Need cost and years above zero and days >= 0.');
  return (cost / (years * 365.25)) * days;
}

// Years to pay the system back if savings keep coming at the average daily rate so far.
// A straight-line guess from bills that may cover only some seasons, so callers should say so.
export function paybackYearsAtPace({ cost, saved, days }) {
  if (![cost, saved, days].every(Number.isFinite) || cost <= 0 || days <= 0) return err('bad_input', 'Need cost and days above zero.');
  if (saved <= 0) return err('no_savings', 'No savings yet, so there is no pace to project.');
  return cost / ((saved / days) * 365.25);
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

// Sustained drop in round-trip efficiency against the owner's own first bills (docs/SPEC.md F9).
// Threshold decided by Fred, 29 Sep 2026: flag when the latest 2 bills are both 5 or more percentage points
// below the average of the first 3 bills. Tunable: change here only.
export const RTE_DROP_POINTS = 0.05;
export const RTE_BASELINE_BILLS = 3;
export const RTE_RUN = 2;

// efficiencies: round-trip efficiency per bill as fractions, oldest first, null where a bill has none.
// Returns null until there are baseline + run valid values (5), else { baseline, latest, dropPoints, flagged }.
// dropPoints is in fractions of 1 (0.07 = 7 points) and is baseline minus the mean of the latest 2 bills.
export function efficiencyDrop(efficiencies) {
  if (!Array.isArray(efficiencies)) return err('bad_input', 'Need a list of efficiencies.');
  const vals = efficiencies.filter((v) => Number.isFinite(v));
  if (vals.length < RTE_BASELINE_BILLS + RTE_RUN) return null;
  const baseline = vals.slice(0, RTE_BASELINE_BILLS).reduce((a, v) => a + v, 0) / RTE_BASELINE_BILLS;
  const recent = vals.slice(-RTE_RUN);
  const latest = recent.reduce((a, v) => a + v, 0) / RTE_RUN;
  const flagged = recent.every((v) => baseline - v >= RTE_DROP_POINTS - 1e-9);
  return { baseline, latest, dropPoints: baseline - latest, flagged };
}

// Battery value = D x (r_import - r_export): what each stored kWh earns over exporting it.
export function batteryValue({ d, rImport, rExport }) {
  return Number.isFinite(d) && d >= 0 && Number.isFinite(rImport) && Number.isFinite(rExport) ? d * (rImport - rExport) : err('bad_input', 'Need D >= 0 and numeric rates.');
}

// Compares the load implied by the balance above with the home load the owner's app reports (needs a CT meter).
// Shows the gap; it does not judge it, because no tolerance has been agreed.
export function loadCheck({ implied, app }) {
  if (!Number.isFinite(implied) || !Number.isFinite(app) || app <= 0) return err('bad_input', 'Need the implied load and an app load above zero.');
  return { gapKwh: implied - app, gapPct: (implied / app - 1) * 100 };
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
