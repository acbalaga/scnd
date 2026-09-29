// SCND app: Alpine component. All maths is in calc.js; this file only wires inputs to it.
// Nothing is sent anywhere. Sun data comes from public/data/ph-grid.json (static file).
import * as calc from './calc.js';
import { loadGrid, lookup, isLowDiffuse } from './grid.js';

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

let nextId = 1;
const newBill = () => ({ id: nextId++, start: '', end: '', inverterKwh: '', importKwh: '', exportKwh: '', genRate: '', varCharges: '', total: '', outageHours: '' });

document.addEventListener('alpine:init', () => {
  Alpine.data('scnd', () => ({
    cities: CITIES,
    facings: FACINGS,
    place: '',
    s: { lat: '', lon: '', kWp: '', acKw: '', tilt: 10, azimuth: 0, commissioned: '', hybrid: false, netMetering: true, cost: '', promisedYears: '' },
    ready: false,
    setupError: '',
    climate: null,
    lowDiffuse: false,
    bills: [newBill()],

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
          Object.assign(out, { pr, hPoa: p.hPoa, band: calc.prBand(pr, p.midMonth), midMonth: p.midMonth });
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
      out.flags = calc.sanityFlags({ kWp: num(s.kWp), acKw: num(s.acKw), exportKwh: Number.isFinite(x) ? x : undefined, netMeteringActive: s.netMetering, outageHours: num(b.outageHours) });
      return out;
    },

    // Two consecutive red bills, oldest to newest, ending at this bill.
    redRaised(b) {
      const ordered = this.bills.filter((x) => x.start).sort((a, c) => (a.start < c.start ? -1 : 1));
      const k = ordered.findIndex((x) => x.id === b.id);
      if (k < 1) return false;
      return calc.redFlag(ordered.slice(0, k + 1).map((x) => this.result(x)?.band ?? null));
    },

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
