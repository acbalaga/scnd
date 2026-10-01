// SCND app: Alpine component. All maths is in calc.js; this file only wires inputs to it.
// Nothing is sent anywhere. Sun data comes from public/data/ph-grid.json (static file).
import * as calc from './calc.js';
import { loadGrid, lookup, isLowDiffuse } from './grid.js';
import { fetchSatellite, fetchNasa } from './weather.js';
import { serialize, parse } from './data.js';
import { findings, MIN_DEGRADATION_PAIRS } from './findings.js';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const round1 = (v) => Math.round(v * 10) / 10;
// Today on the owner's own clock, as YYYY-MM-DD. toISOString() is UTC, which is yesterday in PH before 8 am.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

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

const REPORT_BAND = { green: 'Within range', amber: 'Below range', red: 'Low' };
const REPORT_WORDING = { green: 'within the usual range', amber: 'a little below the usual range', red: 'low' };
const BAND_SHORT = { green: 'healthy', amber: 'a bit low', red: 'low' };
const BAND_LABEL = { green: 'Within range', amber: 'A bit low, worth watching', red: 'Low' };
const FLAG_TEXT = {
  no_export_after_activation: 'You said net metering is on, but this bill shows 0 kWh sent to the grid. Ask the utility whether your meter was actually changed to a bi-directional one.',
  outage: 'Outage hours were entered. On-grid inverters shut off during brownouts by design, so some of the gap is expected.',
  clipping: 'Panels are more than 1.3 times the inverter size, so the inverter caps output on sunny days.',
  overlap: 'These dates overlap another bill, so savings and payback count the shared days twice. Check the reading dates.',
};

const DECODE_FLAG_TEXT = {
  gen_above_buy: "Mas mataas ang generation charge na inilagay mo kaysa sa average na binibili mo. Tingnan kung ang 'Variable charges' ay ang subtotal bago ang export credit.",
  credit_exceeds_variable: 'Mas malaki ang export credit kaysa sa variable charges. Itanong sa utility kung paano hinahawakan ang sobrang credit sa bill mo (carry-over o hindi). Hindi ito kinukwenta ng SCND.',
  total_below_charges: 'Mas mababa ang total mo kaysa sa lumalabas sa kwenta. Baka may discount o carry-over na credit, o may maling numero. Balikan ang bill.',
};

const HYBRID_FLAG_TEXT = {
  grid_charging: 'The battery took in more energy than the solar left over after export, so some of it came from the grid. That can be a charge schedule or backup mode setting. Worth checking it is what you intended.',
};

// Feedback: a link to Fred's Google Form (SCND Beta Feedback, set 30 Sep 2026). The footer link only shows when this is set.
// It is a plain link the user chooses to click (no request from this page). The form is Google's, so the footer
// asks people not to type bill or account numbers into it. Name and email in the form are optional.
const FEEDBACK_URL = 'https://forms.gle/uaUyhAR2PLqakpME8';

// One date style across titles, chart and table: "1 Sep 2026". Locale formatters disagree (en-GB "Sept", en-PH month first).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (t, withYear) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${withYear ? ' ' + d.getUTCFullYear() : ''}`; };
const DIAL_MIN = 0.45, DIAL_MAX = 0.95;   // PR range the dial arc covers (see dial())
// Bill number fields with the names the owner sees, for plain error messages.
const NUM_FIELDS = [['inverterKwh', 'solar produced'], ['chargeKwh', 'battery charged'], ['dischargeKwh', 'battery discharged'], ['homeLoadKwh', 'home load'],
  ['importKwh', 'bought from the grid'], ['exportKwh', 'sent to the grid'], ['genRate', 'generation charge'], ['varCharges', 'variable charges'], ['total', 'total amount due'], ['outageHours', 'outage hours']];
const BILL_FIELDS = ['start', 'end', ...NUM_FIELDS.map(([k]) => k)];
let nextId = 1;
const newBill = () => ({ id: nextId++, start: '', end: '', inverterKwh: '', importKwh: '', exportKwh: '', genRate: '', varCharges: '', total: '', outageHours: '', chargeKwh: '', dischargeKwh: '', homeLoadKwh: '', open: true });

document.addEventListener('alpine:init', () => {
  Alpine.data('scnd', () => ({
    minPairs: MIN_DEGRADATION_PAIRS,
    cities: CITIES,
    facings: FACINGS,
    place: '',
    s: { lat: '', lon: '', kWp: '', acKw: '', tilt: 10, azimuth: 0, commissioned: '', hybrid: false, netMetering: false, cost: '', promisedYears: '', warrantyPct: '', batteryCost: '' },
    ready: false,
    setupError: '',
    climate: null,
    lowDiffuse: false,
    bills: [newBill()],
    // Actual-month weather, fetched only when the user clicks. status: idle | loading | done | failed (no source usable).
    fileMessage: '',
    setupOpen: true,
    example: false,
    savedOnce: false,
    saveNudgeHidden: false,
    feedbackHref: FEEDBACK_URL,
    showSheet: false,
    weather: { status: 'idle', sat: null, nasa: null, satBase: null, nasaBase: null, errors: [] },
    weatherAt: null,
    resetWeather() { this.weather = { status: 'idle', sat: null, nasa: null, satBase: null, nasaBase: null, errors: [] }; this.weatherAt = null; },

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
      const missing = [];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) missing.push('location');
      if (!Number.isFinite(kWp) || kWp <= 0) missing.push('panel size (kWp)');
      if (!Number.isFinite(acKw) || acKw <= 0) missing.push('inverter size (kW)');
      if (!Number.isFinite(tilt) || tilt < 0 || tilt > 90) missing.push('roof tilt (0 to 90)');
      if (missing.length) {
        this.setupError = `Please fill in: ${missing.join(', ')}.`;
        // Take the owner to the first field that needs them (the error line alone can sit below the fold).
        const first = { location: 'fPlace', 'panel size (kWp)': 'fKwp', 'inverter size (kW)': 'fAc', 'roof tilt (0 to 90)': 'fTilt' }[missing[0]];
        this.$nextTick(() => this.$refs[first]?.focus());
        return;
      }
      s.lat = round1(lat); s.lon = round1(lon);       // only ever use the rounded point
      // Weather fetched for another point would be applied to this one, so drop it when the location changes.
      if (this.weatherAt && (this.weatherAt.lat !== s.lat || this.weatherAt.lon !== s.lon)) this.resetWeather();
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
      this.setupOpen = false;
    },

    async checkWeather() {
      const w = this.weather;
      w.status = 'loading'; w.errors = [];
      this.weatherAt = { lat: this.s.lat, lon: this.s.lon };
      const [sat, nasa] = await Promise.allSettled([fetchSatellite(this.s.lat, this.s.lon), fetchNasa(this.s.lat, this.s.lon)]);
      for (const [key, r, label] of [['sat', sat, 'Satellite (Himawari)'], ['nasa', nasa, 'NASA POWER']]) {
        w[key] = null; w[key + 'Base'] = null;
        if (r.status === 'rejected') { w.errors.push(`${label} could not be reached.`); continue; }
        const base = calc.weatherBaseline(r.value);
        if (calc.isError(base)) { w.errors.push(`${label}: ${base.message}`); continue; }
        w[key] = r.value; w[key + 'Base'] = base;
      }
      // Neither source usable: say so, rather than letting each bill read "no data for these dates".
      w.status = w.sat || w.nasa ? 'done' : 'failed';
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
      a.download = `scnd-${today()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.savedOnce = true; this.savedSnap = this.snap();
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
      this.bills = r.bills.length ? r.bills.map((b, k, all) => ({ ...b, id: nextId++, open: k === all.length - 1 })) : [newBill()];
      this.example = false; this.savedOnce = true;
      this.resetWeather();
      this.ready = false; this.showSheet = false;
      await this.continueSetup();
      this.savedSnap = this.snap();
      this.fileMessage = this.ready ? `Loaded ${this.bills.length} bill${this.bills.length === 1 ? '' : 's'}.` : '';
    },

    // Findings sheet (F3): the latest 6 bills as a table, plus questions built from the results.
    get sheet() {
      if (!this.ready) return null;
      const rows = this.bills.filter((b) => b.start && b.end).sort((a, c) => (a.start < c.start ? -1 : 1))
        .map((b) => ({ b, r: this.result(b) })).filter((x) => x.r && x.r.pr !== null);
      const cum = this.cumulative, perDay = this.promisedPerDay;
      const payback = perDay && cum.length ? { saved: cum[cum.length - 1].saved, promised: perDay * cum[cum.length - 1].day, days: cum[cum.length - 1].day } : null;
      const f = findings({
        payback, degradation: this.degradationResult, efficiency: this.efficiencyTrend,
        bills: rows.map(({ b, r }) => ({
          start: b.start, end: b.end, period: this.fmtRange(b.start, b.end), pr: r.pr, band: r.band, redRaised: this.redRaised(b), actualKwh: num(b.inverterKwh),
          expectedKwh: r.expectedKwh, weather: r.weather, flags: r.flags, savings: r.savings, hybridFlags: r.hybrid?.flags ?? [],
        })),
      });
      const s = this.s, face = (FACINGS.find((x) => x.az === num(s.azimuth))?.label ?? `${s.azimuth}°`).toLowerCase();
      const date = today(), lastRow = rows.length ? rows[rows.length - 1] : null;
      const latest = lastRow ? { period: this.fmtRange(lastRow.b.start, lastRow.b.end), pr: this.fmt(lastRow.r.pr, 2), band: lastRow.r.band } : null;
      const nq = f.items.length;
      // Basis lines: what the numbers rest on. Data sources are ours (README "Sources decision", 29 Sep 2026).
      const weatherUsed = rows.some((x) => x.r.weather && !x.r.weather.missing);
      const adjusted = rows.some((x) => x.r.basis === 'weather');
      const sources = [
        `PR is the electricity produced divided by what the panels are rated to produce in the sun received. Within the usual range is ${calc.PR_BANDS.green} or more, with a lower limit of ${calc.PR_BANDS.amberWet} (June to October) or ${calc.PR_BANDS.amberDry} (November to May). Expected output assumes a PR of ${calc.PR_BANDS.green}.`,
        `Sun data: NASA POWER typical-year climatology (2001 to 2020), transposed to the panel tilt and facing.${weatherUsed ? ' Weather index compares each period with a 2020 to 2025 baseline from satellite data (Himawari, through Open-Meteo) and NASA POWER, where 1.00 is a typical year.' : ''}`,
        ...(adjusted ? ['Where the weather check gave a result and its sources agreed within 5 points, PR and expected output are adjusted for that period\'s weather. Otherwise they are against a typical year (marked "not used" in the weather column).'] : []),
      ];
      return {
        ...f,
        date, ref: `SCND-${date.replaceAll('-', '')}`,
        summary: latest ? `For ${latest.period}, the performance ratio was ${latest.pr}, ${REPORT_WORDING[latest.band]}. ${nq ? `${nq} question${nq === 1 ? '' : 's'} ${nq === 1 ? 'is' : 'are'} raised for the installer.` : 'No questions are raised.'}` : '',
        system: [
          ['Array capacity', `${s.kWp} kWp`], ['Inverter', `${s.acKw} kW (DC/AC ${this.fmt(num(s.kWp) / num(s.acKw), 2)})`],
          ['Orientation', `${s.tilt}° tilt, facing ${face}`], ['System type', s.hybrid ? 'Hybrid with battery' : 'On-grid'],
          ['Location (rounded)', `${s.lat}, ${s.lon}`], ['Switched on', s.commissioned || 'Not given'],
        ],
        rows: rows.slice(-5).map(({ b, r }) => ({
          period: this.fmtRange(b.start, b.end), actual: this.fmt(num(b.inverterKwh), 0), expected: this.fmt(r.expectedKwh, 0),
          pr: this.fmt(r.pr, 2), band: REPORT_BAND[r.band], low: r.band === 'red',
          wi: r.weather && !r.weather.missing ? this.fmt(r.weather.wi, 2) + (r.basis === 'weather' ? '' : ' (not used)') : 'n/a',
          exported: Number.isFinite(num(b.exportKwh)) ? this.fmt(num(b.exportKwh), 0) : 'n/a', saved: r.savings !== null ? this.fmt(r.savings, 0) : 'n/a',
        })),
        shown: Math.min(rows.length, 5), total: rows.length, latest,
        latestWording: latest ? REPORT_WORDING[latest.band] : '',
        savedTotal: cum.length ? 'PHP ' + this.fmt(cum[cum.length - 1].saved, 0) : null,
        sources: [...sources, ...f.uncertainty],
      };
    },

    // ---- Presentation helpers (no maths here) ----
    get step() {
      if (!this.ready) return 1;
      return this.bills.some((b) => this.result(b)?.pr != null) ? 3 : 2;
    },
    scrollTo(id) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    },
    fmtDate(iso) {
      const t = Date.parse(iso);
      return Number.isFinite(t) ? dayMonth(t, true) : '';
    },
    // "1 Jul to 1 Aug 2026", or with both years when the bill crosses New Year.
    fmtRange(start, end) {
      const a = Date.parse(start), b = Date.parse(end);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
      const sameYear = new Date(a).getUTCFullYear() === new Date(b).getUTCFullYear();
      return `${dayMonth(a, !sameYear)} to ${dayMonth(b, true)}`;
    },
    // Live-region text: the latest bill's plain-sentence answer. Changes only when the band does, so it is not chatty.
    get announce() {
      for (let i = this.bills.length - 1; i >= 0; i--) {
        const h = this.headline(this.bills[i]);
        if (h) return `${this.billTitle(this.bills[i], i)}: ${h}`;
      }
      return '';
    },
    billTitle(b, i) { return b.start && b.end ? this.fmtRange(b.start, b.end) : `Bill ${i + 1}`; },
    get summaryLine() {
      const s = this.s, face = FACINGS.find((x) => x.az === num(s.azimuth))?.label.toLowerCase() ?? '';
      return `${s.kWp} kWp, ${s.acKw} kW inverter, ${s.tilt}° ${face}${s.hybrid ? ', battery' : ''}${this.place ? ', ' + this.place : ''}`;
    },
    // What a bill still needs before each part of the answer can show.
    needsPR(b) {
      const need = [];
      if (!b.start || !b.end) need.push('both reading dates');
      if (!Number.isFinite(num(b.inverterKwh))) need.push(this.s.hybrid ? 'PV yield' : 'solar produced');
      return need;
    },
    chipClass(b) { return this.result(b)?.band ?? 'none'; },
    chipText(b) { const r = this.result(b); return r?.band ? `PR ${this.fmt(r.pr, 2)}, ${BAND_SHORT[r.band]}` : 'Not enough yet'; },
    headline(b) {
      const r = this.result(b);
      if (!r || r.pr === null) return '';
      if (r.band === 'green') return 'Looks healthy.';
      if (r.band === 'amber') return 'A bit low. Worth watching, not worrying.';
      return this.redRaised(b) ? 'Low two months in a row. Worth asking your installer.' : 'Low this month. One month is not enough to call a fault.';
    },
    answerSub(b) {
      const r = this.result(b);
      if (!r || r.pr === null) return '';
      const g = num(b.inverterKwh), gap = (g / r.expectedKwh - 1) * 100;
      return `${this.fmt(g, 0)} kWh made, against about ${this.fmt(r.expectedKwh, 0)} kWh for a healthy system in that sun (${this.fmt(Math.abs(gap), 0)}% ${gap < 0 ? 'under' : 'over'}).`;
    },
    // Half-dial: red, amber and green zones from PR_BANDS for this bill's season, and a needle at the PR.
    // The arc spans PR DIAL_MIN to DIAL_MAX, not 0 to 1: on a 0 to 1 arc red took 65% of the dial and an amber month
    // looked like a failure. The needle clamps at the ends; the LCD always shows the true PR. Display only, bands unchanged.
    dial(b) {
      const r = this.result(b);
      if (!r || r.pr === null) return '';
      const amberFloor = calc.isDrySeason(r.midMonth) ? calc.PR_BANDS.amberDry : calc.PR_BANDS.amberWet, green = calc.PR_BANDS.green;
      const pos = (pr) => Math.max(0, Math.min((pr - DIAL_MIN) / (DIAL_MAX - DIAL_MIN), 1));
      const pt = (pr, rad) => { const a = Math.PI * (1 - pos(pr)); return [100 + rad * Math.cos(a), 100 - rad * Math.sin(a)]; };
      const arc = (v0, v1, cls) => { const [x0, y0] = pt(v0, 80), [x1, y1] = pt(v1, 80); return `<path class="arc" style="stroke:var(--${cls})" d="M${x0.toFixed(1)} ${y0.toFixed(1)} A80 80 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"/>`; };
      const deg = -90 + pos(r.pr) * 180, gap = 0.004;
      const [gx, gy] = pt(green, 99), [ax, ay] = pt(amberFloor, 99);
      const pr = this.fmt(r.pr, 2);
      return `<svg viewBox="-6 -4 212 150" role="img" aria-label="Performance ratio ${pr}, ${BAND_SHORT[r.band]}. Healthy is ${green} or more.">`
        + arc(DIAL_MIN, amberFloor - gap, 'd-red') + arc(amberFloor + gap, green - gap, 'd-amber') + arc(green + gap, DIAL_MAX, 'd-green')
        + `<text class="scale" x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" text-anchor="middle">${amberFloor}</text><text class="scale" x="${gx.toFixed(1)}" y="${gy.toFixed(1)}" text-anchor="middle">${green}</text>`
        + `<g class="needle" style="--a:${deg.toFixed(1)}deg"><line x1="100" y1="100" x2="100" y2="34"/><circle cx="100" cy="100" r="6"/></g>`
        + `<rect x="40" y="108" width="120" height="36" rx="7" fill="#0E1B2C"/><text class="lcd-lbl" x="48" y="130">PR</text>`
        + `<text class="lcd-ghost" x="152" y="135" text-anchor="end">8.88</text><text class="lcd-num" x="152" y="135" text-anchor="end">${pr}</text></svg>`;
    },
    weatherTeaser(b) { const w = this.result(b)?.weather; return w && !w.missing ? `Index ${this.fmt(w.wi, 2)}` : (this.weather.status === 'done' ? 'No data' : (this.weather.status === 'failed' ? "Couldn't check" : 'Not checked')); },
    get canCheckWeather() { return this.bills.some((b) => this.result(b)?.pr != null); },

    // ---- Example: a made-up system with two bills, so an owner sees a full result in one tap ----
    // Example numbers only. 9.70 PHP/kWh is Meralco's September 2026 generation charge (docs/SPEC.md); the rest is made up.
    async loadExample() {
      this.place = 'Manila';
      this.s = { ...this.s, lat: 14.6, lon: 121, kWp: 5.5, acKw: 5, tilt: 10, azimuth: 0, commissioned: '', hybrid: false, netMetering: true, cost: '', promisedYears: '', warrantyPct: '', batteryCost: '' };
      await this.continueSetup();
      if (!this.ready) return;
      const now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth();
      const iso = (mm) => new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
      const bills = [[iso(m - 2), iso(m - 1), 0.79], [iso(m - 1), iso(m), 0.70]].map(([start, end, pr], k, all) => {
        const p = calc.poaPeriod({ ghi: this.climate.ghi, dif: this.climate.dif, tilt: 10, azimuth: 0, lat: this.s.lat, start, end });
        const solar = Math.round(pr * 5.5 * p.hPoa), used = Math.round(solar * 0.4), sent = solar - used, bought = 450 - used;
        const variable = Math.round(bought * 12), credit = sent * 9.7;
        return { ...newBill(), start, end, inverterKwh: solar, importKwh: bought, exportKwh: sent, genRate: 9.7, varCharges: variable, total: Math.round(Math.max(variable - credit, 0) + 620), open: false };
      });
      this.bills = bills; this.example = true; this.savedOnce = false; this.saveNudgeHidden = false;
      this.resetWeather();
      this.$nextTick(() => this.scrollTo('bills'));
    },
    clearExample() {
      this.example = false; this.ready = false; this.setupOpen = true; this.place = '';
      this.s = { lat: '', lon: '', kWp: '', acKw: '', tilt: 10, azimuth: 0, commissioned: '', hybrid: false, netMetering: false, cost: '', promisedYears: '', warrantyPct: '', batteryCost: '' };
      this.bills = [newBill()]; this.climate = null; this.lowDiffuse = false;
      this.resetWeather();
      this.savedSnap = this.snap();   // a fresh start has nothing to lose
    },

    // The new bill lands at the bottom of the list: bring it into view and put the cursor in its first date, so the
    // owner sees it appear (scrolling to the end of the list left it above the screen on phones).
    addBill() {
      this.bills.forEach((x) => { x.open = false; });
      this.bills.push(newBill());
      this.$nextTick(() => this.focusBill(this.bills.length - 1, 'input[type=date]'));
    },
    focusBill(i, sel) {
      const a = document.querySelectorAll('#bills article.card')[i]; if (!a) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      a.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      a.querySelector(sel)?.focus({ preventScroll: true });
    },
    // A bill with numbers in it asks first (there is no undo); an empty one goes at once.
    removing: null,
    billHasData(b) { return BILL_FIELDS.some((k) => String(b[k] ?? '').trim() !== ''); },
    askRemove(b, el) {
      if (!this.billHasData(b)) return this.removeBill(b.id);
      this.removing = b.id;
      this.$nextTick(() => el.closest('article')?.querySelector('.confirm .keep')?.focus());
    },
    // After a remove, focus the bill that took its place (or the new last one), not the top of the page.
    removeBill(id) {
      const k = this.bills.findIndex((b) => b.id === id);
      this.bills = this.bills.filter((b) => b.id !== id); this.removing = null;
      this.$nextTick(() => this.focusBill(Math.min(k, this.bills.length - 1), '.bill-title h3'));
    },
    // Index of the first bill with an answer: the PR definition is shown there only, not under every dial.
    get firstAnswered() { return this.bills.findIndex((b) => this.result(b)?.pr != null); },

    // One result object per bill. Only fields the bill has enough data for are filled.
    result(b) {
      if (!this.ready || !this.climate) return null;
      const s = this.s, errors = [], out = { errors, flags: [], pr: null, split: null, savings: null };
      if (!b.start || !b.end) return null;
      const negative = NUM_FIELDS.filter(([k]) => num(b[k]) < 0).map(([, label]) => label);
      if (negative.length) { errors.push(`These cannot be below zero: ${negative.join(', ')}. Check the minus sign.`); return out; }
      const p = calc.poaPeriod({ ghi: this.climate.ghi, dif: this.climate.dif, tilt: num(s.tilt), azimuth: num(s.azimuth), lat: s.lat, start: b.start, end: b.end });
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
      // Judge on weather-adjusted PR once the weather call is trusted (calc.judgedPr). The typical-year values are kept.
      if (out.pr !== null) {
        const j = calc.judgedPr({ pr: out.pr, expectedKwh: out.expectedKwh, call: out.weather && !out.weather.missing ? out.weather : null });
        if (!calc.isError(j)) Object.assign(out, { prTypical: out.pr, expectedTypical: out.expectedKwh, pr: j.pr, expectedKwh: j.expectedKwh, basis: j.basis, band: calc.prBand(j.pr, out.midMonth) });
      }
      out.flags = calc.sanityFlags({ kWp: num(s.kWp), acKw: num(s.acKw), exportKwh: Number.isFinite(x) ? x : undefined, netMeteringActive: s.netMetering, outageHours: num(b.outageHours) });
      // Overlap with an earlier bill (or the same dates entered twice): flagged on the later one. One shared day is
      // an off-by-one in the reading dates, not a duplicate, so it is let through.
      const k = this.bills.indexOf(b);
      const earlier = this.bills.filter((o, n) => o !== b && o.start && o.end && (o.start < b.start || (o.start === b.start && n < k)));
      if (earlier.some((o) => calc.overlapDays(o, b) > 1)) out.flags.push('overlap');
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
      if (k < 1 || !calc.isConsecutive(ordered[k - 1], ordered[k])) return false;   // a skipped month breaks the run
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
    flagText(f) {
      return f === 'no_export_after_activation' && this.s.hybrid ? FLAG_TEXT[f] + ' If your system is set to zero export, untick net metering in setup.' : FLAG_TEXT[f];
    },
    fmt: (v, d) => (Number.isFinite(v) ? v.toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d }) : ''),

    // ---- Payback (F6) ----
    // Points on the savings curve, oldest bill first. day = days since the first reading date.
    get cumulative() {
      const rows = this.bills.filter((b) => b.start).sort((a, c) => (a.start < c.start ? -1 : 1))
        .map((b) => ({ b, r: this.result(b) })).filter((x) => x.r && x.r.savings !== null);
      if (!rows.length) return [];
      const t0 = Date.parse(rows[0].b.start);
      let sum = 0;
      return rows.map(({ b, r }) => { sum += r.savings; return { day: (Date.parse(b.end) - t0) / 86400000, saved: sum, date: b.end }; });
    },
    get startDate() { const b = this.bills.filter((x) => x.start).sort((a, c) => (a.start < c.start ? -1 : 1))[0]; return b ? b.start : ''; },

    // Promised line: cost spread evenly over the promised years, from the first reading date.
    get promisedPerDay() {
      const cost = num(this.s.cost), yrs = num(this.s.promisedYears);
      return cost > 0 && yrs > 0 ? cost / (yrs * 365.25) : null;
    },

    get paybackStats() {
      const c = this.cumulative; if (!c.length) return null;
      const last = c[c.length - 1], cost = num(this.s.cost), yrs = num(this.s.promisedYears);
      const okNum = (v) => (calc.isError(v) ? null : v);
      const promised = cost > 0 && yrs > 0 ? okNum(calc.promisedSavings({ cost, years: yrs, days: last.day })) : null;
      const years = cost > 0 ? okNum(calc.paybackYearsAtPace({ cost, saved: last.saved, days: last.day })) : null;
      return { saved: last.saved, days: last.day, promised, gapPct: promised ? (last.saved / promised - 1) * 100 : null, years, promisedYears: yrs > 0 ? yrs : null, cost: cost > 0 ? cost : null };
    },
    get paybackText() {
      const t = this.paybackStats; if (!t) return '';
      let out = `Over ${this.fmt(t.days, 0)} days you saved ₱${this.fmt(t.saved, 0)}.`;
      if (t.promised !== null) out += ` At the promised pace you would have saved ₱${this.fmt(t.promised, 0)}, so you are ${this.fmt(Math.abs(t.gapPct), 0)}% ${t.gapPct >= 0 ? 'ahead' : 'behind'}.`;
      if (t.years !== null) out += ` At your pace so far the system pays itself back in about ${this.fmt(t.years, 1)} years${t.promisedYears ? `, against ${this.fmt(t.promisedYears, 1)} promised` : ''}.`;
      return out + ' Your bills may cover only some months, so treat this as a rough guide until you have a full year.';
    },

    // Chart model: pixel positions in a 340 x 200 box, clean axis ticks, one point per bill.
    get chartModel() {
      const c = this.cumulative; if (!c.length) return null;
      const W = 340, H = 200, L = 48, R = 16, T = 14, B = 30, pw = W - L - R, ph = H - T - B;
      const perDay = this.promisedPerDay, xMax = Math.max(c[c.length - 1].day, 30);
      const top = Math.max(c[c.length - 1].saved, perDay ? perDay * xMax : 0, 1);
      const raw = top / 4, pow = 10 ** Math.floor(Math.log10(raw)), n = raw / pow, step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
      const yMax = Math.ceil(top / step) * step, X = (d) => L + (d / xMax) * pw, Y = (v) => T + (1 - v / yMax) * ph;
      const pts = c.map((p) => ({ ...p, x: X(p.day), y: Y(p.saved), promised: perDay ? perDay * p.day : null, yp: perDay ? Y(perDay * p.day) : null }));
      const yTicks = []; for (let v = 0; v <= yMax + 1e-9; v += step) yTicks.push({ v, y: Y(v), label: v === 0 ? '₱0' : (step >= 1000 ? `₱${+(v / 1000).toFixed(1)}k` : `₱${v}`) });
      const t0 = Date.parse(this.startDate), xTicks = [{ day: 0, label: this.fmtShort(this.startDate) }];
      for (let d = new Date(t0); ; ) {
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
        const day = (d.getTime() - t0) / 86400000;
        if (day > xMax) break;
        if (day >= xMax * 0.14 && day <= xMax * 0.92) xTicks.push({ day, label: MON[d.getUTCMonth()] });
      }
      // Always end the axis on the last reading date, and drop a month tick that would crowd it.
      const endMs = t0 + xMax * 86400000, endLabel = this.fmtShort(new Date(endMs).toISOString().slice(0, 10));
      for (let i = xTicks.length - 1; i > 0; i--) if (xTicks[i].day > xMax * 0.8) xTicks.splice(i, 1);
      xTicks.push({ day: xMax, label: endLabel, end: true });
      while (xTicks.length > 5) xTicks.splice(1, 1);
      return { W, H, L, R, T, B, pw, ph, xMax, yMax, X, Y, pts, yTicks, xTicks: xTicks.map((k) => ({ ...k, x: X(k.day) })), perDay, baseY: Y(0) };
    },
    fmtShort(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? dayMonth(t, false) : ''; },

    chartHover: null,
    chartMove(ev) {
      const m = this.chartModel; if (!m) return;
      const r = ev.currentTarget.getBoundingClientRect(), rel = ((ev.clientX - r.left) / r.width) * m.W;
      let best = 0; m.pts.forEach((p, i) => { if (Math.abs(p.x - rel) < Math.abs(m.pts[best].x - rel)) best = i; });
      this.chartHover = best;
    },
    chartKey(dir) { const m = this.chartModel; if (!m) return; const i = this.chartHover === null ? m.pts.length - 1 : this.chartHover + dir; this.chartHover = Math.max(0, Math.min(m.pts.length - 1, i)); },
    get tip() {
      const m = this.chartModel; if (!m || this.chartHover === null || !m.pts[this.chartHover]) return null;
      const p = m.pts[this.chartHover], pct = (p.x / m.W) * 100;
      return { date: this.fmtDate(p.date), saved: '₱' + this.fmt(p.saved, 0), promised: p.promised === null ? null : '₱' + this.fmt(p.promised, 0), style: { left: `${pct.toFixed(1)}%`, transform: `translateX(${pct > 55 ? '-108%' : '8%'})` } };
    },
    get chart() {
      const m = this.chartModel; if (!m) return '';
      const { W, H, L, R, T, ph, pts, yTicks, xTicks, baseY } = m, last = pts[pts.length - 1], hov = this.chartHover !== null ? pts[this.chartHover] : null;
      const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '), first = pts[0];
      const desc = `Cumulative savings in pesos. ${pts.map((p) => `${this.fmtDate(p.date)}: ${this.fmt(p.saved, 0)}`).join('. ')}.${m.perDay ? ' A promised-pace line is drawn for comparison.' : ''}`;
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${desc.replace(/"/g, '')}">`;
      for (const k of yTicks) svg += `<line class="${k.v === 0 ? 'axis-l' : 'grid-l'}" x1="${L}" x2="${W - R}" y1="${k.y.toFixed(1)}" y2="${k.y.toFixed(1)}"/><text x="${L - 6}" y="${(k.y + 4).toFixed(1)}" text-anchor="end">${k.label}</text>`;
      for (const k of xTicks) svg += `<text x="${k.x.toFixed(1)}" y="${H - 8}" text-anchor="${k.day === 0 ? 'start' : (k.end ? 'end' : 'middle')}">${k.label}</text>`;
      svg += `<path d="M${m.X(0).toFixed(1)} ${baseY.toFixed(1)} L${line.replace(/ /g, ' L')} L${last.x.toFixed(1)} ${baseY.toFixed(1)} Z" style="fill:var(--c-save)" opacity=".1"/>`;
      if (m.perDay) svg += `<line x1="${m.X(0).toFixed(1)}" y1="${baseY.toFixed(1)}" x2="${m.X(m.xMax).toFixed(1)}" y2="${m.Y(m.perDay * m.xMax).toFixed(1)}" style="stroke:var(--c-promise)" stroke-width="2" stroke-linecap="round"/>`;
      svg += `<polyline points="${m.X(0).toFixed(1)},${baseY.toFixed(1)} ${line}" fill="none" style="stroke:var(--c-save)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (hov) svg += `<line class="cross" x1="${hov.x.toFixed(1)}" x2="${hov.x.toFixed(1)}" y1="${T}" y2="${(T + ph).toFixed(1)}"/>` + (hov.yp !== null ? `<circle cx="${hov.x.toFixed(1)}" cy="${hov.yp.toFixed(1)}" r="4" style="fill:var(--c-promise);stroke:var(--card)" stroke-width="2"/>` : '');
      for (const p of pts) svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p === hov ? 5.5 : 4}" style="fill:var(--c-save);stroke:var(--card)" stroke-width="2"/>`;
      // One direct label: the latest saving. The legend and the tooltip carry the rest.
      const anchor = last.x > W - 60 ? 'end' : 'start', lx = anchor === 'end' ? last.x - 2 : last.x + 2;
      svg += `<text class="endlbl" x="${lx.toFixed(1)}" y="${Math.max(last.y - 10, T + 8).toFixed(1)}" text-anchor="${anchor}">₱${this.fmt(last.saved, 0)}</text>`;
      return svg + '</svg>';
    },

    // ---- Theme: Auto follows the phone; Light and Dark override it. Stored on this device only. ----
    theme: 'auto',
    // Unsaved-changes prompt: compares what a save would write with what was last saved or loaded. Nothing is stored.
    savedSnap: '',
    snap() { return serialize({ ...this.s, place: this.place }, this.bills, new Date(0)); },
    get unsaved() { return !this.example && this.snap() !== this.savedSnap; },
    // Explainer: hidden until asked for. Nothing is stored.
    introOpen: false,
    openIntro() { this.introOpen = true; this.$nextTick(() => this.scrollTo('about')); },
    closeIntro() { this.introOpen = false; },
    init() {
      this.savedSnap = this.snap();
      window.addEventListener('beforeunload', (e) => { if (this.unsaved) { e.preventDefault(); e.returnValue = ''; } });
      try { const t = localStorage.getItem('scnd-theme'); if (t === 'light' || t === 'dark') this.theme = t; } catch { /* storage blocked: stay on auto */ }
      this.applyTheme();
    },
    cycleTheme() {
      this.theme = { auto: 'light', light: 'dark', dark: 'auto' }[this.theme];
      this.applyTheme();
      try { localStorage.setItem('scnd-theme', this.theme); } catch { /* ignore */ }
    },
    applyTheme() {
      const root = document.documentElement;
      if (this.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', this.theme);
      const colours = { light: '#F3F6FA', dark: '#0A1424' };
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        const wants = m.getAttribute('media')?.includes('dark') ? 'dark' : 'light';
        m.setAttribute('content', this.theme === 'auto' ? colours[wants] : colours[this.theme]);
      });
    },
  }));
});
