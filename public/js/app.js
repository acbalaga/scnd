// SCND app: Alpine component. All maths is in calc.js; this file only wires inputs to it.
// Nothing is sent anywhere. Sun data comes from public/data/ph-grid.json (static file).
import * as calc from './calc.js';
import { loadGrid, lookup, isLowDiffuse } from './grid.js';
import { fetchSatellite, fetchNasa } from './weather.js';
import { serialize, parse } from './data.js';
import { findings, MIN_DEGRADATION_PAIRS } from './findings.js';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const round1 = (v) => Math.round(v * 10) / 10;

// Nearest-city shortcuts, coordinates rounded to 0.1 degree.
const CITIES = [
  ['Laoag', 18.2, 120.6], ['Tuguegarao', 17.6, 121.7], ['Baguio', 16.4, 120.6], ['Angeles', 15.1, 120.6],
  ['Quezon City', 14.7, 121.0], ['Manila', 14.6, 121.0], ['Batangas', 13.8, 121.1], ['Legazpi', 13.1, 123.7],
  ['Puerto Princesa', 9.7, 118.7], ['Iloilo', 10.7, 122.6], ['Bacolod', 10.7, 123.0], ['Cebu', 10.3, 123.9],
  ['Tacloban', 11.2, 125.0], ['Cagayan de Oro', 8.5, 124.6], ['Davao', 7.1, 125.6], ['General Santos', 6.1, 125.2],
  ['Zamboanga', 6.9, 122.1],
].map(([name, lat, lon]) => ({ name, lat, lon }));

// azimuth: 0 = south, 90 = west, -90 = east (same as calc.js).
const FACINGS = [
  { label: 'South', az: 0 }, { label: 'Southeast', az: -45 }, { label: 'Southwest', az: 45 },
  { label: 'East', az: -90 }, { label: 'West', az: 90 },
  { label: 'Northeast', az: -135 }, { label: 'Northwest', az: 135 }, { label: 'North', az: 180 },
];

const BAND_LABEL = { green: 'Within range', amber: 'A bit low, worth watching', red: 'Low' };
const FLAG_TEXT = {
  no_export_after_activation: 'You said net metering is on, but this bill shows 0 kWh sent to the grid. Ask the utility whether your meter was actually changed to a bi-directional one.',
  outage: 'Outage hours were entered. On-grid inverters shut off during brownouts by design, so some of the gap is expected.',
  clipping: 'Panels are more than 1.3 times the inverter size, so the inverter caps output on sunny days.',
};

const DECODE_FLAG_TEXT = {
  gen_above_buy: "Mas mataas ang generation charge na inilagay mo kaysa sa average na binibili mo. Tingnan kung ang 'Variable charges' ay ang subtotal bago ang export credit.",
  credit_exceeds_variable: 'Mas malaki ang export credit kaysa sa variable charges. Itanong sa utility kung paano hinahawakan ang sobrang credit sa bill mo (carry-over o hindi). Hindi ito kinukwenta ng SCND.',
  total_below_charges: 'Mas mababa ang total mo kaysa sa lumalabas sa kwenta. Baka may discount o carry-over na credit, o may maling numero. Balikan ang bill.',
};

const HYBRID_FLAG_TEXT = {
  grid_charging: 'The battery took in more energy than the solar left over after export, so some of it came from the grid. That can be a charge schedule or backup mode setting. Worth checking it is what you intended.',
};

let nextId = 1;
const newBill = () => ({ id: nextId++, start: '', end: '', inverterKwh: '', importKwh: '', exportKwh: '', genRate: '', varCharges: '', total: '', outageHours: '', chargeKwh: '', dischargeKwh: '', homeLoadKwh: '' });

document.addEventListener('alpine:init', () => {
  Alpine.data('scnd', () => ({
    minPairs: MIN_DEGRADATION_PAIRS,
    cities: CITIES,
    facings: FACINGS,
    place: '',
    s: { lat: '', lon: '', kWp: '', acKw: '', tilt: 10, azimuth: 0, commissioned: '', hybrid: false, netMetering: true, cost: '', promisedYears: '', warrantyPct: '', batteryCost: '' },
    ready: false,
    setupError: '',
    climate: null,
    lowDiffuse: false,
    bills: [newBill()],
    // Actual-month weather, fetched only when the user clicks. status: idle | loading | done.
    fileMessage: '',
    showSheet: false,
    weather: { status: 'idle', sat: null, nasa: null, satBase: null, nasaBase: null, errors: [] },

    get clipping() {
      return calc.sanityFlags({ kWp: num(this.s.kWp), acKw: num(this.s.acKw) }).includes('clipping');
    },

    pickPlace() {
      const c = CITIES.find((x) => x.name === this.place);
      if (c) { this.s.lat = c.lat; this.s.lon = c.lon; }
    },

    useMyLocation() {
      if (!navigator.geolocation) { this.setupError = 'This browser cannot share a location. Pick a city instead.'; return; }
      navigator.geolocation.getCurrentPosition(
        (p) => { this.s.lat = round1(p.coords.latitude); this.s.lon = round1(p.coords.longitude); this.place = ''; this.setupError = ''; },
        () => { this.setupError = 'Location was blocked. Pick a city instead.'; },
      );
    },

    async continueSetup() {
      const s = this.s;
      const lat = num(s.lat), lon = num(s.lon), kWp = num(s.kWp), acKw = num(s.acKw), tilt = num(s.tilt);
      if (![lat, lon, kWp, acKw, tilt].every(Number.isFinite) || kWp <= 0 || acKw <= 0 || tilt < 0 || tilt > 90) {
        this.setupError = 'Please fill in location, panel size, inverter size and tilt (0 to 90).';
        return;
      }
      s.lat = round1(lat); s.lon = round1(lon);       // only ever use the rounded point
      try {
        this.climate = lookup(await loadGrid(), s.lat, s.lon);
      } catch (e) {
        this.setupError = 'Could not load the sun data file. Check your connection and reload.';
        return;
      }
      if (!this.climate) { this.setupError = 'That point is outside our Philippines sun data. Check the latitude and longitude.'; return; }
      // Sun data reads low in very clear dry months (README "Spike 2 result", 29 Sep 2026): show a caveat.
      this.lowDiffuse = isLowDiffuse(this.climate);
      this.setupError = '';
      this.ready = true;
    },

    async checkWeather() {
      const w = this.weather;
      w.status = 'loading'; w.errors = [];
      const [sat, nasa] = await Promise.allSettled([fetchSatellite(this.s.lat, this.s.lon), fetchNasa(this.s.lat, this.s.lon)]);
      for (const [key, r, label] of [['sat', sat, 'Satellite (Himawari)'], ['nasa', nasa, 'NASA POWER']]) {
        w[key] = null; w[key + 'Base'] = null;
        if (r.status === 'rejected') { w.errors.push(`${label} could not be reached.`); continue; }
        const base = calc.weatherBaseline(r.value);
        if (calc.isError(base)) { w.errors.push(`${label}: ${base.message}`); continue; }
        w[key] = r.value; w[key + 'Base'] = base;
      }
      w.status = 'done';
    },

    // F4 for one bill: two indices, combined, then the shortfall split. null until the user has checked the weather.
    weatherResult(b, out) {
      const w = this.weather;
      if (w.status !== 'done' || out.pr === null) return null;
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
      const prAdjusted = calc.performanceRatio({ eKwh: num(b.inverterKwh), kWp: num(this.s.kWp), hPoa: out.hPoa * call.wi });
      return { ...call, satWi: sat?.wi ?? null, nasaWi: nasa?.wi ?? null, validDays: (sat ?? nasa).validDays, days: (sat ?? nasa).days, split, prAdjusted: calc.isError(prAdjusted) ? null : prAdjusted };
    },

    // Save and load: a JSON file on the user's own device. Nothing is stored by us.
    saveData() {
      const blob = new Blob([serialize({ ...this.s, place: this.place }, this.bills)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `scnd-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.fileMessage = 'Saved. Keep the file somewhere you can find it. Load it next month and add the new bill.';
    },
    async loadFile(ev) {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      const r = parse(await file.text());
      if (r.error) { this.fileMessage = r.error; return; }
      this.place = r.setup.place;
      this.s = { ...this.s, ...r.setup };
      this.bills = r.bills.length ? r.bills.map((b) => ({ ...b, id: nextId++ })) : [newBill()];
      this.weather = { status: 'idle', sat: null, nasa: null, satBase: null, nasaBase: null, errors: [] };
      this.ready = false; this.showSheet = false;
      await this.continueSetup();
      this.fileMessage = this.ready ? `Loaded ${this.bills.length} bill${this.bills.length === 1 ? '' : 's'}.` : '';
    },

    // Findings sheet (F3): the latest 6 bills as a table, plus questions built from the results.
    get sheet() {
      if (!this.ready) return null;
      const rows = this.bills.filter((b) => b.start && b.end).sort((a, c) => (a.start < c.start ? -1 : 1))
        .map((b) => ({ b, r: this.result(b) })).filter((x) => x.r && x.r.pr !== null);
      const cum = this.cumulative, perDay = this.promisedPerDay;
      const payback = perDay && cum.length ? { saved: cum[cum.length - 1].saved, promised: perDay * cum[cum.length - 1].day } : null;
      const f = findings({
        payback, degradation: this.degradationResult, efficiency: this.efficiencyTrend,
        bills: rows.map(({ b, r }) => ({
          start: b.start, end: b.end, pr: r.pr, band: r.band, redRaised: this.redRaised(b), actualKwh: num(b.inverterKwh),
          expectedKwh: r.expectedKwh, weather: r.weather, flags: r.flags, savings: r.savings, hybridFlags: r.hybrid?.flags ?? [],
        })),
      });
      const s = this.s, face = FACINGS.find((x) => x.az === num(s.azimuth))?.label ?? `${s.azimuth}°`;
      return {
        ...f,
        date: new Date().toISOString().slice(0, 10),
        system: `${s.kWp} kWp panels, ${s.acKw} kW inverter (DC/AC ${this.fmt(num(s.kWp) / num(s.acKw), 2)}), ${s.tilt}° tilt facing ${face.toLowerCase()}, ${s.hybrid ? 'hybrid with battery' : 'on-grid'}, location ${s.lat}, ${s.lon} (rounded), switched on ${s.commissioned || 'month not given'}.`,
        rows: rows.slice(-6).map(({ b, r }) => ({
          period: `${b.start} to ${b.end}`, actual: this.fmt(num(b.inverterKwh), 0), expected: this.fmt(r.expectedKwh, 0),
          pr: this.fmt(r.pr, 2), band: BAND_LABEL[r.band], wi: r.weather && !r.weather.missing ? this.fmt(r.weather.wi, 2) : 'n/a',
          exported: Number.isFinite(num(b.exportKwh)) ? this.fmt(num(b.exportKwh), 0) : 'n/a', saved: r.savings !== null ? '₱' + this.fmt(r.savings, 0) : 'n/a',
        })),
        shown: Math.min(rows.length, 6), total: rows.length,
      };
    },

    addBill() { this.bills.push(newBill()); },
    removeBill(id) { this.bills = this.bills.filter((b) => b.id !== id); },

    // One result object per bill. Only fields the bill has enough data for are filled.
    result(b) {
      if (!this.ready || !this.climate) return null;
      const s = this.s, errors = [], out = { errors, flags: [], pr: null, split: null, savings: null };
      if (!b.start || !b.end) return null;
      const p = calc.poaPeriod({ ghi: this.climate.ghi, dif: this.climate.dif, tilt: num(s.tilt), azimuth: num(s.azimuth), lat: s.lat, start: b.start, end: b.end });
      if (calc.isError(p)) { errors.push(p.message); return out; }
      const g = num(b.inverterKwh), x = num(b.exportKwh), i = num(b.importKwh);
      if (Number.isFinite(g)) {
        const pr = calc.performanceRatio({ eKwh: g, kWp: num(s.kWp), hPoa: p.hPoa });
        if (calc.isError(pr)) errors.push(pr.message);
        else {
          Object.assign(out, { pr, hPoa: p.hPoa, band: calc.prBand(pr, p.midMonth), midMonth: p.midMonth, midYear: p.midYear });
          out.expectedKwh = calc.expectedEnergy({ kWp: num(s.kWp), hPoa: p.hPoa, pr: 0.75 });
        }
      }
      if (Number.isFinite(g) && Number.isFinite(x) && Number.isFinite(i)) {
        const split = calc.energySplit({ g, x, i });
        if (calc.isError(split)) errors.push(split.message);
        else out.split = split;
      }
      if (out.split) {
        const rImport = calc.importRate({ variableCharges: num(b.varCharges), i });
        const rExport = num(b.genRate);
        if (!calc.isError(rImport) && Number.isFinite(rExport)) {
          out.rImport = rImport;
          out.savings = calc.savings({ s: out.split.selfConsumed, x, rImport, rExport });
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
            if (out.rImport !== undefined && Number.isFinite(num(b.genRate))) hb.value = calc.batteryValue({ d, rImport: out.rImport, rExport: num(b.genRate) });
          }
        }
      }
      out.weather = this.weatherResult(b, out);
      out.flags = calc.sanityFlags({ kWp: num(s.kWp), acKw: num(s.acKw), exportKwh: Number.isFinite(x) ? x : undefined, netMeteringActive: s.netMetering, outageHours: num(b.outageHours) });
      return out;
    },

    // F8: same-month weather-adjusted PR, one year apart. Bills are paired by the month and year of their midpoint.
    // Hidden (null) until the bills span 13 months and have a weather check.
    get degradationResult() {
      if (!this.ready) return null;
      const records = [];
      for (const b of this.bills) {
        const r = this.result(b), pr = r?.weather?.prAdjusted;
        if (r && Number.isFinite(pr) && pr > 0) records.push({ year: r.midYear, month: r.midMonth, pr });
      }
      const warrantyPct = num(this.s.warrantyPct), d = calc.degradation(records, warrantyPct);
      return d && !calc.isError(d) ? { ...d, warrantyPct } : null;
    },

    // F9: sustained drop in round-trip efficiency against the owner's own first bills. null until 5 bills have one.
    get efficiencyTrend() {
      if (!this.s.hybrid) return null;
      const ordered = this.bills.filter((b) => b.start).sort((a, c) => (a.start < c.start ? -1 : 1));
      const r = calc.efficiencyDrop(ordered.map((b) => this.result(b)?.hybrid?.roundTripEfficiency ?? null));
      return r && !calc.isError(r) ? r : null;
    },

    // F9: what the battery has earned over the bills entered, against its cost if given.
    get batteryTotal() {
      if (!this.s.hybrid) return null;
      const vals = this.bills.map((b) => this.result(b)?.hybrid?.value).filter(Number.isFinite);
      if (!vals.length) return null;
      const earned = vals.reduce((a, v) => a + v, 0), cost = num(this.s.batteryCost);
      return { earned, bills: vals.length, cost: cost > 0 ? cost : null };
    },

    // Two consecutive red bills, oldest to newest, ending at this bill.
    redRaised(b) {
      const ordered = this.bills.filter((x) => x.start).sort((a, c) => (a.start < c.start ? -1 : 1));
      const k = ordered.findIndex((x) => x.id === b.id);
      if (k < 1) return false;
      return calc.redFlag(ordered.slice(0, k + 1).map((x) => this.result(x)?.band ?? null));
    },

    num,
    decode(b) {
      const v = { importKwh: num(b.importKwh), exportKwh: num(b.exportKwh), genRate: num(b.genRate), varCharges: num(b.varCharges), total: num(b.total) };
      return Object.values(v).every(Number.isFinite) ? calc.billDecode(v) : null;
    },
    decodeFlagText: (f) => DECODE_FLAG_TEXT[f],
    weatherInferredText: (w) => w.source === 'nasa'
      ? 'Inferred. The satellite has no data for these dates, so this weather index comes from NASA POWER alone. It is not cross-checked, so treat the split as a rough guide.'
      : 'Inferred. NASA POWER has no data for these dates, so this weather index comes from the satellite alone. It is not cross-checked, so treat the split as a rough guide.',
    hybridFlagText: (f) => HYBRID_FLAG_TEXT[f],
    bandLabel: (band) => BAND_LABEL[band],
    flagText: (f) => FLAG_TEXT[f],
    fmt: (v, d) => (Number.isFinite(v) ? v.toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d }) : ''),

    // Cumulative savings, oldest bill first: [{ days since first reading, ₱ }].
    get cumulative() {
      const rows = this.bills.filter((b) => b.start).sort((a, c) => (a.start < c.start ? -1 : 1))
        .map((b) => ({ b, r: this.result(b) })).filter((x) => x.r && x.r.savings !== null);
      if (!rows.length) return [];
      const t0 = Date.parse(rows[0].b.start);
      let sum = 0;
      return rows.map(({ b, r }) => { sum += r.savings; return { day: (Date.parse(b.end) - t0) / 86400000, saved: sum }; });
    },

    // Promised line: cost / (years x 365.25) per day, from the first reading date.
    get promisedPerDay() {
      const cost = num(this.s.cost), yrs = num(this.s.promisedYears);
      return cost > 0 && yrs > 0 ? cost / (yrs * 365.25) : null;
    },

    get paybackText() {
      const c = this.cumulative; if (!c.length) return '';
      const last = c[c.length - 1], perDay = this.promisedPerDay;
      let t = `Saved so far: ₱${this.fmt(last.saved, 0)} over ${this.fmt(last.day, 0)} days.`;
      if (perDay) {
        const promised = perDay * last.day;
        const gap = (last.saved / promised - 1) * 100;
        t += ` At the promised payback you would have saved ₱${this.fmt(promised, 0)} by now, so you are ${this.fmt(Math.abs(gap), 0)}% ${gap >= 0 ? 'ahead' : 'behind'}. Bills cover only some months, so compare a full year before drawing a conclusion.`;
      }
      return t;
    },

    get chart() {
      const c = this.cumulative; if (!c.length) return '';
      const W = 320, H = 150, L = 44, R = 8, T = 8, B = 22;
      const perDay = this.promisedPerDay;
      const xMax = Math.max(c[c.length - 1].day, 30);
      const yMax = Math.max(c[c.length - 1].saved, perDay ? perDay * xMax : 0, 1) * 1.1;
      const X = (d) => L + (d / xMax) * (W - L - R), Y = (v) => T + (1 - v / yMax) * (H - T - B);
      const pts = [[0, 0], ...c.map((p) => [p.day, p.saved])].map(([d, v]) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
      let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative savings in pesos over days since first reading">`;
      svg += `<line x1="${L}" y1="${Y(0)}" x2="${W - R}" y2="${Y(0)}" style="stroke:var(--muted)" opacity=".5"/>`;
      svg += `<text x="${L - 4}" y="${Y(0) + 3}" text-anchor="end">0</text><text x="${L - 4}" y="${T + 8}" text-anchor="end">₱${this.fmt(yMax, 0)}</text>`;
      svg += `<text x="${L}" y="${H - 6}">day 0</text><text x="${W - R}" y="${H - 6}" text-anchor="end">day ${this.fmt(xMax, 0)}</text>`;
      if (perDay) svg += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(xMax)}" y2="${Y(perDay * xMax)}" style="stroke:var(--amber)" stroke-dasharray="4 3" stroke-width="2"/>`;
      svg += `<polyline points="${pts}" fill="none" style="stroke:var(--accent)" stroke-width="2.5"/>`;
      svg += `</svg><p class="help"><span style="color:var(--accent)">━</span> your savings${perDay ? ` &nbsp; <span style="color:var(--amber)">╍</span> promised pace` : ''}</p>`;
      return svg;
    },
  }));
});
