// SCND engine: turns the owner's setup and bills into per-bill results and cross-bill summaries. Pure: no DOM, no fetch,
// no Alpine. The formulas live in calc.js; this module decides which formula applies to which bill, in what order, and
// how bills combine (red-flag runs, payback, year-over-year, battery). Moved out of app.js so it is tested (ticket #44,
// CLAUDE.md rule 3). app.js keeps presentation only.
import * as calc from './calc.js';

export const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// Bill number fields with the names the owner sees, for plain error messages.
export const NUM_FIELDS = [['inverterKwh', 'solar produced'], ['chargeKwh', 'battery charged'], ['dischargeKwh', 'battery discharged'], ['homeLoadKwh', 'home load'],
  ['importKwh', 'bought from the grid'], ['exportKwh', 'sent to the grid'], ['genRate', 'generation charge'], ['genAmount', 'generation charge'], ['varRate', 'variable charges'], ['varCharges', 'variable charges'],
  ['total', 'total amount due'], ['outageHours', 'outage hours']];

// Oldest first. Bills without a start date are left out. Same comparator as before the move, so ties keep their order.
export const byStart = (bills) => bills.filter((b) => b.start).sort((a, c) => (a.start < c.start ? -1 : 1));

// The bill's charges as the maths needs them, whichever way the owner entered them (calc.billCharges).
export const chargesOf = (b) => calc.billCharges({ unit: b.chargeUnit, i: num(b.importKwh), genRate: num(b.genRate), genAmount: num(b.genAmount), varRate: num(b.varRate), varCharges: num(b.varCharges) });

// F4 for one bill: two indices, combined, then the shortfall split. null until the owner has checked the weather.
// weather: { status, sat, nasa, satBase, nasaBase } as app.js holds it. out: the bill's typical-year result so far.
export function weatherFor({ bill: b, out, weather: w, kWp }) {
  if (!w || w.status !== 'done' || out.pr === null) return null;
  const idx = (daily, baseline) => {
    if (!daily) return null;
    const r = calc.weatherIndexPeriod({ daily, baseline, start: b.start, end: b.end });
    return r && !calc.isError(r) ? r : null;
  };
  const sat = idx(w.sat, w.satBase), nasa = idx(w.nasa, w.nasaBase);
  const call = calc.weatherCall(sat ? sat.wi : null, nasa ? nasa.wi : null);
  if (call === null) return { missing: true };
  const split = calc.weatherSplit({ eTypical: out.expectedKwh, wi: call.wi, eActual: num(b.inverterKwh) });
  if (calc.isError(split)) return { missing: true };
  const prAdjusted = calc.performanceRatio({ eKwh: num(b.inverterKwh), kWp: num(kWp), hPoa: out.hPoa * call.wi });
  return { ...call, satWi: sat?.wi ?? null, nasaWi: nasa?.wi ?? null, validDays: (sat ?? nasa).validDays, days: (sat ?? nasa).days, split, prAdjusted: calc.isError(prAdjusted) ? null : prAdjusted };
}

// One result object per bill, or null until setup is done and the bill has both dates. Only fields the bill has enough
// data for are filled. bills is the whole list (for the overlap check); ready is setup done; climate is grid.lookup().
export function billResult({ setup: s, climate, ready, weather, bill: b, bills }) {
  if (!ready || !climate) return null;
  const errors = [], out = { errors, flags: [], pr: null, split: null, savings: null };
  if (!b.start || !b.end) return null;
  // Switch-on is a month, so only a period that ends before that month starts is certainly wrong (a bill spanning it is normal).
  // No PR, savings or payback for it: numbers from before the system existed would only mislead.
  if (/^\d{4}-\d{2}$/.test(s.commissioned || '') && b.end.slice(0, 7) < s.commissioned) { out.flags.push('before_commissioning'); return out; }
  const negative = NUM_FIELDS.filter(([k]) => num(b[k]) < 0).map(([, label]) => label);
  if (negative.length) { errors.push(`These cannot be below zero: ${negative.join(', ')}. Check the minus sign.`); return out; }
  const p = calc.poaPeriod({ ghi: climate.ghi, dif: climate.dif, tilt: num(s.tilt), azimuth: num(s.azimuth), lat: s.lat, start: b.start, end: b.end });
  if (calc.isError(p)) { errors.push(p.message); return out; }
  const g = num(b.inverterKwh), x = num(b.exportKwh), i = num(b.importKwh);
  if (Number.isFinite(g)) {
    const pr = calc.performanceRatio({ eKwh: g, kWp: num(s.kWp), hPoa: p.hPoa });
    if (calc.isError(pr)) errors.push(pr.message);
    else {
      Object.assign(out, { pr, hPoa: p.hPoa, band: calc.prBand(pr, p.midMonth), midMonth: p.midMonth, midYear: p.midYear });
      out.expectedKwh = calc.expectedEnergy({ kWp: num(s.kWp), hPoa: p.hPoa, pr: calc.PR_BANDS.green });
    }
  }
  // Hybrids need the battery numbers too, or battery losses would count as solar used (F9 balance).
  const battery = s.hybrid ? { c: num(b.chargeKwh), d: num(b.dischargeKwh) } : {};
  if (Number.isFinite(g) && Number.isFinite(x) && Number.isFinite(i) && Object.values(battery).every(Number.isFinite)) {
    const split = calc.energySplit({ g, x, i, ...battery });
    if (calc.isError(split)) errors.push(split.message);
    else out.split = split;
  }
  const ch = chargesOf(b);
  if (out.split) {
    const rImport = calc.importRate({ variableCharges: ch.varCharges, i });
    const rExport = ch.genRate;
    if (!calc.isError(rImport) && Number.isFinite(rExport)) {
      out.rImport = rImport;
      const creditCap = ch.varCharges;
      out.savings = calc.savings({ s: out.split.selfConsumed, x, rImport, rExport, creditCap });
      out.uncounted = calc.uncountedCredit({ x, rExport, creditCap });
      out.shift = calc.loadShiftValue({ rImport, rExport });
    }
  }
  // F9: hybrid balance, round-trip efficiency, battery value. Needs the battery's charge and discharge for the same period.
  if (s.hybrid) {
    const c = num(b.chargeKwh), d = num(b.dischargeKwh);
    if ([g, x, i, c, d].every(Number.isFinite)) {
      const hb = calc.hybridBalance({ i, gPv: g, x, c, d });
      if (calc.isError(hb)) errors.push(hb.message);
      else {
        out.hybrid = hb;
        const app = num(b.homeLoadKwh);
        if (Number.isFinite(app)) { const lc = calc.loadCheck({ implied: hb.load, app }); if (!calc.isError(lc)) hb.loadCheck = lc; }
        if (out.rImport !== undefined && Number.isFinite(ch.genRate)) hb.value = calc.batteryValue({ d, rImport: out.rImport, rExport: ch.genRate });
      }
    }
  }
  out.weather = weatherFor({ bill: b, out, weather, kWp: s.kWp });
  // Judge on weather-adjusted PR once the weather call is trusted (calc.judgedPr). The typical-year values are kept.
  if (out.pr !== null) {
    const j = calc.judgedPr({ pr: out.pr, expectedKwh: out.expectedKwh, month: out.midMonth, call: out.weather && !out.weather.missing ? out.weather : null });
    if (!calc.isError(j)) Object.assign(out, { prTypical: out.pr, expectedTypical: out.expectedKwh, pr: j.pr, expectedKwh: j.expectedKwh, basis: j.basis, band: calc.prBand(j.pr, out.midMonth),
      weatherRejected: !!j.weatherRejected, inferredRejected: !!j.inferredRejected, prWeather: j.prWeather ?? null });
    // Above what panels can make: a wrong figure, not a healthy month (Fred, 1 Oct 2026).
    if (calc.prTooHigh(out.pr)) out.band = 'check';
    // Below what a working system makes: a typo or a system that was off, not a red month (audit M-8, Fred, 31 Oct 2026).
    else if (calc.prTooLow(out.pr)) { out.band = 'check'; out.checkLow = true; }
  }
  out.flags = calc.sanityFlags({ kWp: num(s.kWp), acKw: num(s.acKw), exportKwh: Number.isFinite(x) ? x : undefined, netMeteringActive: s.netMetering, outageHours: num(b.outageHours) });
  // Overlap with an earlier bill (or the same dates entered twice): flagged on the later one. One shared day is
  // an off-by-one in the reading dates, not a duplicate, so it is let through.
  const k = bills.indexOf(b);
  const earlier = bills.filter((o, n) => o !== b && o.start && o.end && (o.start < b.start || (o.start === b.start && n < k)));
  if (earlier.some((o) => calc.overlapDays(o, b) > 1)) out.flags.push('overlap');
  return out;
}

// Every bill's result plus what is derived across bills. Bills need an `id`.
// Returns { results: Map(id -> result), red: Set(id), firstAnswered, lastAnswered } (indices in list order, -1 if none).
// red: bills that end a run of two consecutive red bills, oldest to newest; a skipped month breaks the run.
export function buildModel({ setup, climate, ready, weather, bills }) {
  const results = new Map();
  for (const b of bills) results.set(b.id, billResult({ setup, climate, ready, weather, bill: b, bills }));
  const band = (b) => results.get(b.id)?.band ?? null;
  const ordered = byStart(bills), red = new Set();
  for (let k = 1; k < ordered.length; k++) {
    if (calc.isConsecutive(ordered[k - 1], ordered[k]) && calc.redFlag([band(ordered[k - 1]), band(ordered[k])])) red.add(ordered[k].id);
  }
  const answered = bills.map((b) => results.get(b.id)?.pr != null);
  return { results, red, firstAnswered: answered.indexOf(true), lastAnswered: answered.lastIndexOf(true) };
}

// ---- Summaries across bills. resultOf(bill) returns that bill's result (from the model). ----

// F6 savings curve, oldest bill first: { day, saved, date } per bill with savings. day counts from `start`, the start
// date of the first bill that has savings; the chart's date axis uses the same start (savingsStart), so the two agree.
export function savingsStart(bills, resultOf) {
  const first = byStart(bills).find((b) => resultOf(b)?.savings != null);
  return first ? first.start : '';
}
export function cumulativeSavings(bills, resultOf) {
  const rows = byStart(bills).map((b) => ({ b, r: resultOf(b) })).filter((x) => x.r && x.r.savings !== null);
  if (!rows.length) return [];
  const t0 = Date.parse(rows[0].b.start);
  let sum = 0;
  return rows.map(({ b, r }) => { sum += r.savings; return { day: (Date.parse(b.end) - t0) / 86400000, saved: sum, date: b.end }; });
}

// Export credit left out of savings by the variable-charges cap, summed over bills with savings (audit M-3).
export function creditLeftOut(bills, resultOf) {
  return bills.reduce((t, b) => { const r = resultOf(b); return t + (r && r.savings !== null && r.uncounted > 0 ? r.uncounted : 0); }, 0);
}

// Promised pace: cost spread evenly over the promised years, per day. null without both.
export function promisedPerDay(setup) {
  const cost = num(setup.cost), yrs = num(setup.promisedYears);
  return cost > 0 && yrs > 0 ? cost / (yrs * 365.25) : null;
}

// Payback figures for the tiles and text. minDays: days of bills before the pace counts as settled (findings.js
// PAYBACK_MIN_DAYS, Fred 1 Oct 2026), passed in so this module does not depend on findings.js.
// season: which season the bills with savings fall in ('wet', 'dry' or 'mixed'), for the early tag.
export function paybackStats({ setup, cumulative, bills, resultOf, minDays }) {
  const c = cumulative; if (!c.length) return null;
  const last = c[c.length - 1], cost = num(setup.cost), yrs = num(setup.promisedYears);
  const okNum = (v) => (calc.isError(v) ? null : v);
  const promised = cost > 0 && yrs > 0 ? okNum(calc.promisedSavings({ cost, years: yrs, days: last.day })) : null;
  const years = cost > 0 ? okNum(calc.paybackYearsAtPace({ cost, saved: last.saved, days: last.day })) : null;
  // Before about a year of bills the pace leans on whichever season the bills cover (the sheet waits a year too).
  const early = last.day < minDays;
  const months = bills.map(resultOf).filter((r) => r?.savings != null).map((r) => r.midMonth);
  const dry = months.filter(calc.isDrySeason).length;
  const season = dry === 0 ? 'wet' : dry === months.length ? 'dry' : 'mixed';
  return { saved: last.saved, days: last.day, promised, gapPct: promised ? (last.saved / promised - 1) * 100 : null, years, promisedYears: yrs > 0 ? yrs : null, cost: cost > 0 ? cost : null, early, season };
}

// F8: same-month weather-adjusted PR, one year apart, paired by the month and year of each bill's midpoint.
// null until the bills span 13 months and have a weather check. Adds warrantyPct to calc.degradation's result.
export function degradationFor({ setup, bills, resultOf }) {
  const records = [];
  for (const b of bills) {
    const r = resultOf(b), w = r?.weather, pr = w?.prAdjusted;
    // A rejected weather index or an implausible PR would put a wrong figure into the year-over-year pairs. Months where
    // the two sources disagreed by more than 5 points are left out too, as the PR verdict leaves them out (ticket #45).
    if (r && Number.isFinite(pr) && pr > 0 && !w.uncertain && !r.weatherRejected && !calc.prTooHigh(pr) && !calc.prTooLow(pr)) {
      records.push({ year: r.midYear, month: r.midMonth, pr, days: w.days, source: w.source });
    }
  }
  const warrantyPct = num(setup.warrantyPct), d = calc.degradation(records, warrantyPct);
  return d && !calc.isError(d) ? { ...d, warrantyPct } : null;
}

// F9: sustained drop in round-trip efficiency against the owner's first bills. null until 5 bills have one.
export function efficiencyFor({ setup, bills, resultOf }) {
  if (!setup.hybrid) return null;
  const r = calc.efficiencyDrop(byStart(bills).map((b) => resultOf(b)?.hybrid?.roundTripEfficiency ?? null));
  return r && !calc.isError(r) ? r : null;
}

// F9: what the battery has earned over the bills entered, against its cost if given.
export function batteryTotalFor({ setup, bills, resultOf }) {
  if (!setup.hybrid) return null;
  const vals = bills.map((b) => resultOf(b)?.hybrid?.value).filter(Number.isFinite);
  if (!vals.length) return null;
  const earned = vals.reduce((a, v) => a + v, 0), cost = num(setup.batteryCost);
  return { earned, bills: vals.length, cost: cost > 0 ? cost : null };
}
