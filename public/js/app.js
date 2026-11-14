// SCND app: Alpine component. All maths is in calc.js; this file only wires inputs to it.
// Nothing is sent anywhere. Sun data comes from public/data/ph-grid.json (static file).
import * as calc from './calc.js';
import * as engine from './engine.js';
import { loadGrid, lookup, isLowDiffuse } from './grid.js';
import { fetchSatellite, fetchNasa, SOURCE_LABELS } from './weather.js';
import { serialize, parse } from './data.js';
import { EXAMPLES, exampleBills } from './examples.js';
import { findings, MIN_DEGRADATION_PAIRS, PAYBACK_MIN_DAYS } from './findings.js';

const { num, NUM_FIELDS } = engine;
// Number boxes take digits, one decimal point and (only where min allows) a leading minus. Browsers
// otherwise let "e", "+" and pasted text through type="number" fields.
const numberOk = (el, text) => /^-?\d*\.?\d*$/.test(text) && (!text.includes('-') || el.min === '' || Number(el.min) < 0);
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.type !== 'number' || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  if (!/[\d.]/.test(e.key) && !(e.key === '-' && (el.min === '' || Number(el.min) < 0))) e.preventDefault();
});
document.addEventListener('paste', (e) => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.type === 'number' && !numberOk(el, (e.clipboardData?.getData('text') || '').trim())) e.preventDefault();
});
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

// 'check': PR above calc.PR_PLAUSIBLE_MAX (more than panels can make) or below calc.PR_PLAUSIBLE_MIN (checkLow: a typo or a
// system that was off), so a figure is likely wrong. Never called healthy, never counted as red.
const REPORT_BAND = { green: 'Within range', amber: 'Below range', red: 'Low', check: 'Check figures' };
const REPORT_WORDING = { green: 'within the usual range', amber: 'a little below the usual range', red: 'low', check: 'above what panels this size can make, so a figure is likely wrong', checkLow: 'below what a working system makes, so a figure is likely wrong or the system was off' };
const BAND_SHORT = { green: 'healthy', amber: 'a bit low', red: 'low', check: 'check numbers' };
const BAND_LABEL = { green: 'Within range', amber: 'A bit low, worth watching', red: 'Low', check: 'Check figures' };
const FLAG_TEXT = {
  no_export_after_activation: 'You said net metering is on, but this bill shows 0 kWh sent to the grid. Ask the utility whether your meter was actually changed to a bi-directional one.',
  outage: 'Outage hours were entered. On-grid inverters shut off during brownouts by design, so some of the gap is expected.',
  clipping: 'Panels are more than 1.3 times the inverter size, so the inverter caps output on sunny days.',
  before_commissioning: 'This period ends before the month you said the system was switched on. Check the reading dates, or the switch-on month in setup. No result is shown for this bill until they agree.',
  overlap: 'These dates overlap another bill, so savings and payback count the shared days twice. Check the reading dates.',
};

const DECODE_FLAG_TEXT = {
  gen_above_buy: "The generation charge you entered is higher than your average import price. Check that 'Variable charges' is the subtotal before the export credit.",
  credit_exceeds_variable: 'The export credit is larger than the variable charges. Ask the utility whether the extra credit carries over on your bill. SCND does not model it.',
  total_below_charges: 'Your total is lower than the sums here give. There may be a discount or a carried-over credit, or a number may be wrong. Recheck the bill.',
};

const HYBRID_FLAG_TEXT = {
  grid_charging: 'The battery took in more energy than the solar left over after export, so some of it came from the grid. That can be a charge schedule or backup mode setting. Worth checking it is what you intended.',
};

// Feedback: a link to Fred's Google Form (SCND Beta Feedback, set 30 Sep 2026). The footer link only shows when this is set.
// It is a plain link the user chooses to click (no request from this page). The form is Google's, so the footer
// asks people not to type bill or account numbers into it. Name and email in the form are optional.
const FEEDBACK_URL = 'https://forms.gle/uaUyhAR2PLqakpME8';

// Tip links (2 Oct 2026). Plain links the owner chooses to open: no Ko-fi widget, no script, no request from this page.
// The QR is a picture served from this site (public/assets/qr-ph.png, added by hand); it is probed once when the findings
// sheet opens and the QR entry stays hidden if the file is missing. PAYEE_NAME is what the GCash or Maya app shows after
// a scan, so a tipper can check they are paying the right person. The payee line stays hidden while it holds the placeholder.
const KOFI_URL = 'https://ko-fi.com/alfredbalaga';
const QR_PH_SRC = '/assets/qr-ph.png';
const PAYEE_NAME = 'AL***D B.';   // as GCash shows it after a scan (masked by GCash), given by Fred 2 Oct 2026

// One date style across titles, chart and table: "1 Sep 2026". Locale formatters disagree (en-GB "Sept", en-PH month first).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (t, withYear) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${withYear ? ' ' + d.getUTCFullYear() : ''}`; };
const DIAL_MIN = 0.45, DIAL_MAX = 0.95;   // PR range the dial arc covers (see dial())
const BILL_FIELDS = ['start', 'end', ...NUM_FIELDS.map(([k]) => k)];
let nextId = 1;
// Every bill's result, worked out once per change to the inputs (ticket #39). Templates call result(b) about 100 times
// per bill and several getters scan all bills, so recomputing on each call took about 17 s per keystroke at 56 bills on
// a slow phone. An effect in init() reads every input and rebuilds the model. It then bumps `ver[id]` only for the bills
// whose result changed, `ver.fold` when the first or last answered bill moved, and `ver.all` on every change, so a
// keystroke re-renders only the bills it affects plus the summaries. Getters that summarise all bills are memoized on
// the model (memo()), so the many bindings that read them share one computation. The model is kept
// outside Alpine's reactive state on purpose, so filling it never triggers a re-render. It is built from `raw`, the
// plain object Alpine wraps (see Alpine.data below): Alpine.raw() cannot reach it, because methods run with `this` set to
// a merged scope proxy rather than the reactive object.
const newBill = () => ({ id: nextId++, start: '', end: '', inverterKwh: '', importKwh: '', exportKwh: '', chargeUnit: 'amount', genRate: '', genAmount: '', varRate: '', varCharges: '', total: '', outageHours: '', chargeKwh: '', dischargeKwh: '', homeLoadKwh: '', open: true });

document.addEventListener('alpine:init', () => {
  document.getElementById('boot')?.remove();   // the "Loading" fallback in index.html (audit M-11); only a failed start leaves it showing
  let model = null, built = null;
  const memos = new Map();
  Alpine.data('scnd', () => { const raw = {
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
    fieldErr: {},
    started: false,   // landing shows the hero first; the setup form opens on "Check my system"
    example: false,
    savedOnce: false,
    saveNudgeHidden: false,
    feedbackHref: FEEDBACK_URL,
    kofiHref: KOFI_URL,
    qrSrc: QR_PH_SRC,
    payeeName: PAYEE_NAME && !/^\[.*\]$/.test(PAYEE_NAME) ? PAYEE_NAME : '',
    qrOk: false,
    qrProbed: false,
    showSheet: false,
    weather: { status: 'idle', sat: null, nasa: null, satBase: null, nasaBase: null, errors: [], noAnswer: false },
    weatherAt: null,
    ver: { all: 0, fold: 0 },   // per-bill result versions, bumped by the effect in init() (see the note above `let model`)
    resetWeather() { this.weather = { status: 'idle', sat: null, nasa: null, satBase: null, nasaBase: null, errors: [], noAnswer: false }; this.weatherAt = null; },

    // Called when the findings sheet opens. A missing file never fires onload, so the QR entry stays hidden.
    probeQr() {
      if (this.qrProbed || !this.qrSrc) return;
      this.qrProbed = true;
      const img = new Image();
      img.onload = () => { this.qrOk = true; };
      img.src = this.qrSrc;
    },

    get clipping() {
      return calc.sanityFlags({ kWp: num(this.s.kWp), acKw: num(this.s.acKw) }).includes('clipping');
    },

    pickPlace() {
      const c = CITIES.find((x) => x.name === this.place);
      if (c) { this.s.lat = c.lat; this.s.lon = c.lon; this.geo = { state: 'idle', text: '' }; }
    },

    // Feedback line under the location picker. state: idle | asking | ok | warn | fail.
    geo: { state: 'idle', text: '' },
    nearestCity(lat, lon) {
      const km = (c) => { const r = Math.PI / 180, dx = (c.lon - lon) * r * Math.cos(lat * r), dy = (c.lat - lat) * r; return 6371 * Math.hypot(dx, dy); };
      return CITIES.reduce((a, c) => (km(c) < km(a) ? c : a));
    },
    useMyLocation() {
      if (!navigator.geolocation) { this.geo = { state: 'fail', text: 'This browser cannot share a location. Pick a city instead.' }; return; }
      this.geo = { state: 'asking', text: 'Asking your device for its location. Allow it if your browser prompts.' };
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const lat = round1(p.coords.latitude), lon = round1(p.coords.longitude);
          this.s.lat = lat; this.s.lon = lon; this.place = ''; this.setupError = ''; delete this.fieldErr.place;
          // Same box as the sun data file (task 1). Outside it, Continue would reject the point, so say so now.
          if (lat < 4.5 || lat > 21 || lon < 116.5 || lon > 127) { this.geo = { state: 'warn', text: `Your device reports ${lat}, ${lon}, which is outside the Philippines. Pick the city nearest your system instead.` }; return; }
          this.geo = { state: 'ok', text: `Using your location, rounded to ${lat}, ${lon} (about 11 km). Nearest city: ${this.nearestCity(lat, lon).name}. It stays in your browser.` };
        },
        (e) => {
          const why = e.code === 1 ? 'Location was blocked for this site. Allow it in your browser settings, or pick a city.'
            : e.code === 3 ? 'Your device took too long to answer. Try again, or pick a city.'
            : 'Your device could not work out where it is. Pick a city instead.';
          this.geo = { state: 'fail', text: why };
        },
        { timeout: 15000, maximumAge: 600000 },
      );
    },

    async continueSetup(fromButton = false) {
      const s = this.s, wasReady = this.ready;
      const lat = num(s.lat), lon = num(s.lon), kWp = num(s.kWp), acKw = num(s.acKw), tilt = num(s.tilt);
      const missing = [];
      this.fieldErr = {};
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { missing.push('location'); this.fieldErr.place = 'Pick the nearest city, or enter coordinates under it.'; }
      if (!Number.isFinite(kWp) || kWp <= 0) { missing.push('panel size (kWp)'); this.fieldErr.kWp = 'Needed. A number above 0.'; }
      if (!Number.isFinite(acKw) || acKw <= 0) { missing.push('inverter size (kW)'); this.fieldErr.acKw = 'Needed. A number above 0.'; }
      if (!Number.isFinite(tilt) || tilt < 0 || tilt > 90) { missing.push('roof tilt (0 to 90)'); this.fieldErr.tilt = 'Between 0 and 90. Not sure? Use 10.'; }
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
      // A hybrid needs battery numbers on every bill: open the bills that lack them so the owner sees the fields.
      if (s.hybrid) this.bills.forEach((b) => { if (!Number.isFinite(num(b.chargeKwh)) || !Number.isFinite(num(b.dischargeKwh))) b.open = true; });
      this.ready = true;
      this.setupOpen = false;
      // The button that was pressed has just been hidden: put focus where the owner goes next, not on the page.
      if (fromButton) this.$nextTick(() => (wasReady ? document.getElementById('setupEdit')?.focus() : this.focusBill(0, '.bill-title h3')));
    },
    openSetup() { this.setupOpen = true; this.$nextTick(() => this.$refs.fPlace?.focus()); },

    async checkWeather() {
      const w = this.weather;
      if (w.status === 'loading') return;   // buttons stay focusable while loading (aria-disabled), so guard here
      w.status = 'loading'; w.errors = [];
      this.weatherAt = { lat: this.s.lat, lon: this.s.lon };
      const [sat, nasa] = await Promise.allSettled([fetchSatellite(this.s.lat, this.s.lon), fetchNasa(this.s.lat, this.s.lon)]);
      w.noAnswer = true;   // stays true only if every source failed to answer at all (no connection or too slow)
      for (const [key, r] of [['sat', sat], ['nasa', nasa]]) {
        const label = SOURCE_LABELS[key];
        w[key] = null; w[key + 'Base'] = null;
        if (r.status === 'rejected') {
          // weather.js words its own errors (no answer, too slow, an error, unreadable data); anything else is a bug here.
          const e = r.reason;
          w.errors.push(e?.name === 'WeatherError' ? e.message : `${label} could not be reached.`);
          if (e?.kind !== 'unreachable' && e?.kind !== 'timeout') w.noAnswer = false;
          continue;
        }
        w.noAnswer = false;
        const base = calc.weatherBaseline(r.value);
        if (calc.isError(base)) { w.errors.push(`${label}: ${base.message}`); continue; }
        w[key] = r.value; w[key + 'Base'] = base;
      }
      // Neither source usable: say so, rather than letting each bill read "no data for these dates".
      w.status = w.sat || w.nasa ? 'done' : 'failed';
    },

    // F4 for one bill: two indices, combined, then the shortfall split. null until the user has checked the weather.
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
    get sheet() { return this.memo('sheet', () => this.computeSheet()); },
    computeSheet() {
      if (!this.ready) return null;
      const rows = this.bills.filter((b) => b.start && b.end).sort((a, c) => (a.start < c.start ? -1 : 1))
        .map((b) => ({ b, r: this.result(b) })).filter((x) => x.r && x.r.pr !== null);
      const cum = this.cumulative, perDay = this.promisedPerDay;
      const payback = perDay && cum.length ? { saved: cum[cum.length - 1].saved, promised: perDay * cum[cum.length - 1].day, days: cum[cum.length - 1].day } : null;
      const f = findings({
        payback, creditLeftOut: this.creditLeftOut, degradation: this.degradationResult, efficiency: this.efficiencyTrend,
        bills: rows.map(({ b, r }) => ({
          start: b.start, end: b.end, period: this.fmtRange(b.start, b.end), pr: r.pr, band: r.band, basis: r.basis, redRaised: this.redRaised(b), actualKwh: num(b.inverterKwh),
          expectedKwh: r.expectedKwh, weather: r.weather, flags: r.flags, savings: r.savings, hybridFlags: r.hybrid?.flags ?? [],
        })),
      });
      const s = this.s, face = (FACINGS.find((x) => x.az === num(s.azimuth))?.label ?? `${s.azimuth}°`).toLowerCase();
      const date = today(), lastRow = rows.length ? rows[rows.length - 1] : null;
      const latest = lastRow ? { period: this.fmtRange(lastRow.b.start, lastRow.b.end), pr: this.fmt(lastRow.r.pr, 2), band: lastRow.r.band, checkLow: !!lastRow.r.checkLow } : null;
      const wording = (x) => REPORT_WORDING[x.checkLow ? 'checkLow' : x.band];
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
        summary: latest ? `For ${latest.period}, the performance ratio was ${latest.pr}, ${wording(latest)}. ${nq ? `${nq} question${nq === 1 ? '' : 's'} ${nq === 1 ? 'is' : 'are'} raised for the installer.` : 'No questions are raised.'}` : '',
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
        latestWording: latest ? wording(latest) : '',
        savedTotal: cum.length ? '₱' + this.fmt(cum[cum.length - 1].saved, 0) : null,
        sources: [...sources, ...f.uncertainty,
          ...rows.filter((x) => x.r.weatherRejected).map(({ b, r }) => `For ${this.fmtRange(b.start, b.end)} the weather-adjusted PR came out at ${this.fmt(r.prWeather, 2)}, above what panels can make, so the weather data for those dates looks off. That period is judged against a typical year.`),
          // Ticket #40 (Fred, 14 Nov 2026): a one-source index may clear a low month but not make one (calc.judgedPr).
          ...rows.filter((x) => x.r.inferredRejected).map(({ b, r }) => `For ${this.fmtRange(b.start, b.end)} the weather index came from one source with nothing to cross-check it, and it would have put PR at ${this.fmt(r.prWeather, 2)}, a lower band than against a typical year. A single unchecked source is not used to mark a month lower, so that period is judged against a typical year.`),
          ...rows.filter((x) => x.r.band === 'check' && x.r.checkLow).map(({ b, r }) => `PR for ${this.fmtRange(b.start, b.end)} works out at ${this.fmt(r.pr, 2)}, below the ${calc.PR_PLAUSIBLE_MIN.toFixed(2)} a working system makes, so a figure is likely wrong (reading dates, solar kWh or panel size) or the system was off for part of the period. It is not counted as a low month.`),
          ...rows.filter((x) => x.r.band === 'check' && !x.r.checkLow).map(({ b, r }) => `PR for ${this.fmtRange(b.start, b.end)} works out at ${this.fmt(r.pr, 2)}, above the ${calc.PR_PLAUSIBLE_MAX.toFixed(2)} panels reach in practice, so a figure is likely wrong (reading dates, solar kWh or panel size). Check it before relying on this sheet.`),
          ...(this.gaps.length ? [`Bills are missing for ${this.gaps.map((g) => this.fmtRange(g.from, g.to)).join(', ')}. Two low months either side of a gap are not counted as in a row, and savings to date leave out the missing ${this.gaps.length === 1 ? 'period' : 'periods'}, so the payback pace reads low.`] : [])],
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
    // Earlier bills that already have an answer fold to one line once a newer bill has one too (long scroll on phones).
    foldable(i) { this.ver.fold; return i < (model ??= raw.buildModel()).lastAnswered; },
    folded(b, i) { return this.foldable(i) && !b.expanded && this.removing !== b.id; },
    // Placeholders only (never a value): last month's numbers as a reference while typing. Nothing is saved from them.
    prevHint(i, key) { const v = i > 0 ? num(this.bills[i - 1]?.[key]) : NaN; return Number.isFinite(v) ? `last bill: ${this.fmt(v, 0)}` : ''; },
    // Charges fields fall back to an example (styled italic, like every placeholder) when there is no last bill to go on.
    // 9.70 PHP/kWh is Meralco's September 2026 generation charge (docs/SPEC.md); 12.00 PHP/kWh variable is made up.
    varHint(b, i) {
      const p = i > 0 ? this.bills[i - 1] : null, last = p ? this.charges(p).varCharges : NaN, rate = last / num(p?.importKwh);
      if (b.chargeUnit === 'rate') return Number.isFinite(rate) ? `last bill: ${this.fmt(rate, 2)}` : 'e.g. 12.00';
      if (!Number.isFinite(rate)) return 'e.g. 3600.00';
      const kwh = num(b.importKwh);
      return Number.isFinite(kwh) && kwh > 0 ? `about ${this.fmt(rate * kwh, 0)}` : `last bill: ${this.fmt(last, 0)}`;
    },
    genHint(b, i) {
      const p = i > 0 ? this.bills[i - 1] : null, rate = p ? this.charges(p).genRate : NaN, kwh = num(b.importKwh);
      if (b.chargeUnit === 'rate') return 'e.g. 9.7000';
      if (!Number.isFinite(rate) || !(kwh > 0)) return 'e.g. 2910.00';
      return `about ${this.fmt(rate * kwh, 0)}`;
    },
    // The bill's charges as the maths needs them, whichever way the owner entered them (calc.billCharges).
    charges(b) { return engine.chargesOf(b); },
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
    // Once PR shows: what savings still need. Says the bill numbers are only for savings, and catches the battery
    // numbers a hybrid needs (ticking "battery" after entering bills used to drop savings with no word why).
    needsSavings(b) {
      const r = this.result(b); if (!r || r.pr === null || r.savings !== null) return [];
      const fields = [['importKwh', 'bought from the grid'], ['exportKwh', 'sent to the grid'],
        ...(b.chargeUnit === 'rate' ? [['genRate', 'generation charge'], ['varRate', 'variable charges']] : [['genAmount', 'generation charge'], ['varCharges', 'variable charges']]),
        ...(this.s.hybrid ? [['chargeKwh', 'battery charged'], ['dischargeKwh', 'battery discharged']] : [])];
      return fields.filter(([k]) => !Number.isFinite(num(b[k]))).map(([, label]) => label);
    },
    chipClass(b) { return this.result(b)?.band ?? 'none'; },
    chipText(b) { const r = this.result(b); if (r?.flags.includes('before_commissioning')) return 'Check dates'; return r?.band ? `PR ${this.fmt(r.pr, 2)}, ${BAND_SHORT[r.band]}` : 'Not enough yet'; },
    headline(b) {
      const r = this.result(b);
      if (!r || r.pr === null) return '';
      if (r.band === 'check') return r.checkLow ? 'Lower than a working system makes. Check the dates and kWh, or whether the system was off.' : 'Higher than panels this size can make. Check the dates and kWh.';
      if (r.band === 'green') return 'Looks healthy.';
      if (r.band === 'amber') return 'A bit low. Worth watching, not worrying.';
      if (!this.redRaised(b)) return 'Low this month. One month is not enough to call a fault.';
      // Pre-launch audit H-3: against a typical year, a cloudy stretch can cause this, so weather comes before the installer.
      return r.basis === 'weather' ? 'Low two months in a row. Worth asking your installer.' : 'Low two months in a row. Check the weather before asking your installer.';
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
      return !r || r.pr === null ? '' : this.dialSvg(r);
    },
    // Landing preview: the same dial as a real answer, for made-up numbers (August, so the wet-season bands).
    get sampleDial() { return this.dialSvg({ pr: 0.79, band: 'green', midMonth: 8 }, 'Example answer: performance ratio 0.79, healthy. Healthy is 0.75 or more.'); },
    dialSvg(r, label) {
      const amberFloor = calc.isDrySeason(r.midMonth) ? calc.PR_BANDS.amberDry : calc.PR_BANDS.amberWet, green = calc.PR_BANDS.green;
      const pos = (pr) => Math.max(0, Math.min((pr - DIAL_MIN) / (DIAL_MAX - DIAL_MIN), 1));
      const pt = (pr, rad) => { const a = Math.PI * (1 - pos(pr)); return [100 + rad * Math.cos(a), 100 - rad * Math.sin(a)]; };
      const arc = (v0, v1, cls) => { const [x0, y0] = pt(v0, 80), [x1, y1] = pt(v1, 80); return `<path class="arc" style="stroke:var(--${cls})" d="M${x0.toFixed(1)} ${y0.toFixed(1)} A80 80 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"/>`; };
      const deg = -90 + pos(r.pr) * 180, gap = 0.004;
      const [gx, gy] = pt(green, 99), [ax, ay] = pt(amberFloor, 99);
      const pr = this.fmt(r.pr, 2);
      // PR above what panels can make: one grey arc, grey needle and digits, so the gauge reads as "check this", not a result.
      const check = r.band === 'check';
      return `<svg viewBox="-6 -4 212 150" role="img" class="${check ? 'is-check' : ''}" aria-label="${label ?? `Performance ratio ${pr}, ${BAND_SHORT[r.band]}. Healthy is ${green} or more.`}">`
        + (check ? arc(DIAL_MIN, DIAL_MAX, 'd-grey')
          : arc(DIAL_MIN, amberFloor - gap, 'd-red') + arc(amberFloor + gap, green - gap, 'd-amber') + arc(green + gap, DIAL_MAX, 'd-green'))
        + `<text class="scale" x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" text-anchor="middle">${amberFloor}</text><text class="scale" x="${gx.toFixed(1)}" y="${gy.toFixed(1)}" text-anchor="middle">${green}</text>`
        + `<g class="needle" style="--a:${deg.toFixed(1)}deg"><line x1="100" y1="100" x2="100" y2="34"/><circle cx="100" cy="100" r="6"/></g>`
        + `<rect x="40" y="108" width="120" height="36" rx="7" fill="#0E1B2C"/><text class="lcd-lbl" x="48" y="130">PR</text>`
        + `<text class="lcd-ghost" x="152" y="135" text-anchor="end">8.88</text><text class="lcd-num" x="152" y="135" text-anchor="end">${pr}</text></svg>`;
    },
    weatherTeaser(b) { const w = this.result(b)?.weather; return w && !w.missing ? `Index ${this.fmt(w.wi, 2)}` : (this.weather.status === 'done' ? 'No data' : (this.weather.status === 'failed' ? "Couldn't check" : 'Not checked')); },
    // Status line inside the two-low-months block: what the weather check is doing, and why it failed.
    get weatherStatusLine() {
      const w = this.weather;
      if (w.status === 'loading') return 'Checking the weather for these dates.';
      if (w.status !== 'failed') return '';
      const unreachable = w.errors.length && w.noAnswer;
      return `The weather check did not get through: ${unreachable ? 'neither weather service could be reached. Check your connection and try again' : 'the weather services gave no usable data for these dates. Try again later'}, or go ahead with the findings sheet, which shows PR against a typical year's sun.`;
    },
    get canCheckWeather() { return this.bills.some((b) => this.result(b)?.pr != null); },

    // ---- Example: a made-up system with two bills, so an owner sees a full result in one tap ----
    // Example numbers only. 9.70 PHP/kWh is Meralco's September 2026 generation charge (docs/SPEC.md); the rest is made up.
    // Made-up systems from examples.js: 'ongrid' (two bills, quick look) or 'hybrid' (14 months, battery, payback).
    async loadExample(kind = 'ongrid') {
      const ex = EXAMPLES[kind];
      this.place = ex.place;
      this.s = { ...this.s, ...ex.setup };
      await this.continueSetup();
      if (!this.ready) return;
      this.bills = exampleBills(kind, { climate: this.climate }).map((b) => ({ ...newBill(), ...b, open: false }));
      this.example = kind; this.savedOnce = false; this.saveNudgeHidden = false;
      this.resetWeather();
      this.$nextTick(() => this.focusBill(0, '.bill-title h3'));
    },
    clearExample() {
      this.example = false; this.ready = false; this.setupOpen = true; this.started = true; this.place = '';
      setTimeout(() => { this.scrollTo('setup'); document.querySelector('[x-ref=fPlace]')?.focus({ preventScroll: true }); }, 50);
      this.s = { lat: '', lon: '', kWp: '', acKw: '', tilt: 10, azimuth: 0, commissioned: '', hybrid: false, netMetering: false, cost: '', promisedYears: '', warrantyPct: '', batteryCost: '' };
      this.bills = [newBill()]; this.climate = null; this.lowDiffuse = false;
      this.resetWeather();
      this.savedSnap = this.snap();   // a fresh start has nothing to lose
    },

    // The new bill lands at the bottom of the list: bring it into view and put the cursor in its first date, so the
    // owner sees it appear (scrolling to the end of the list left it above the screen on phones).
    addBill() {
      this.bills.forEach((x) => { x.open = false; });
      // Dates run on from the last bill and the generation charge usually repeats: prefill both, owner can change them.
      const prev = this.bills[this.bills.length - 1], nb = newBill();
      if (prev?.end) nb.start = prev.end;
      if (prev) nb.chargeUnit = prev.chargeUnit;
      if (String(prev?.genRate ?? '').trim() !== '') nb.genRate = prev.genRate;
      nb.prefill = { start: nb.start, genRate: nb.genRate };
      this.bills.push(nb);
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
    billHasData(b) { return BILL_FIELDS.some((k) => String(b[k] ?? '').trim() !== '' && String(b[k]) !== String(b.prefill?.[k] ?? '')); },
    askRemove(b, el) {
      if (!this.billHasData(b)) return this.removeBill(b.id);
      this.removing = b.id;
      this.$nextTick(() => el.closest('article')?.querySelector('.confirm .keep')?.focus());
    },
    keepBill(el) { this.removing = null; this.$nextTick(() => el.closest('article')?.querySelector('.bill-head .link')?.focus()); },
    // After a remove, focus the bill that took its place (or the new last one), not the top of the page.
    removeBill(id) {
      const k = this.bills.findIndex((b) => b.id === id);
      this.bills = this.bills.filter((b) => b.id !== id); this.removing = null;
      this.$nextTick(() => this.focusBill(Math.min(k, this.bills.length - 1), '.bill-title h3'));
    },
    // Index of the first bill with an answer: the PR definition is shown there only, not under every dial.
    get firstAnswered() { this.ver.fold; return (model ??= raw.buildModel()).firstAnswered; },

    // Everything the bill results feed into, read once so the effect in init() depends on all of it and nothing else.
    inputKey() {
      const w = this.weather;
      return [this.ready, this.climate, w.status, w.sat, w.nasa, w.satBase, w.nasaBase,
        ...Object.keys(this.s).map((k) => this.s[k]),
        ...this.bills.flatMap((b) => [b.id, b.chargeUnit, ...BILL_FIELDS.map((k) => b[k])])];
    },
    // All bill results plus what is derived across bills. Built from `raw`, so it adds no reactive dependencies.
    // Called by refreshModel, and once on first use if a template asks before init() has run. Returns { results, red, firstAnswered, lastAnswered, keys }.
    buildModel() {
      const m = engine.buildModel({ setup: raw.s, climate: raw.climate, ready: raw.ready, weather: raw.weather, bills: raw.bills });
      // What each bill shows, as text: a bill is re-rendered only when this changes.
      m.keys = new Map(raw.bills.map((b) => [b.id, JSON.stringify([m.results.get(b.id), m.red.has(b.id)])]));
      return m;
    },
    // Rebuild the model and bump the versions of what changed. Readers re-run on the writes (made through the reactive
    // proxy); the old versions are read from `raw` so this effect does not depend on its own writes.
    // The writes wait for a microtask: Alpine runs each queued job once per flush and drops a re-trigger of a job that has
    // already run in it, so a binding that read the old model earlier in this flush would otherwise keep showing it.
    // The new model goes live in the same microtask, so every binding in one flush sees the same model: a child of an x-if
    // could otherwise read the new model while its parent still shows for the old one.
    refreshModel() {
      const old = built ?? model, m = raw.buildModel();
      built = m;
      const bumped = [...m.keys].filter(([id, key]) => old?.keys.get(id) !== key).map(([id]) => id);
      const fold = !old || old.firstAnswered !== m.firstAnswered || old.lastAnswered !== m.lastAnswered;
      queueMicrotask(() => {
        model = m;
        for (const id of bumped) this.ver[id] = (raw.ver[id] ?? 0) + 1;
        if (fold) this.ver.fold = raw.ver.fold + 1;
        this.ver.all = raw.ver.all + 1;
      });
    },
    // The model, built on first use if a template asks before init() has run. Readers depend on ver.all, which moves on
    // every input change, so anything memoized on the model is recomputed exactly once per change.
    get model() { this.ver.all; return model ??= raw.buildModel(); },
    memo(name, fn) {
      const m = this.model, c = memos.get(name);
      if (c && c.m === m) return c.v;
      const v = fn();
      memos.set(name, { m, v });
      return v;
    },
    // One result object per bill (null until setup is done and the bill has dates). Shared between callers: read only.
    // Depends only on this bill's version, so a change to one bill does not re-render the others.
    result(b) {
      this.ver[b.id];
      const r = (model ??= raw.buildModel()).results.get(b.id);
      // A bill added since the last refresh: work it out directly once; the refresh puts it in the model.
      return r !== undefined ? r : raw.computeResult(Alpine.raw(b));
    },
    // Only fields the bill has enough data for are filled.
    computeResult(b) { return engine.billResult({ setup: this.s, climate: this.climate, ready: this.ready, weather: this.weather, bill: b, bills: this.bills }); },

    // F8: same-month weather-adjusted PR, one year apart. Bills are paired by the month and year of their midpoint.
    // Hidden (null) until the bills span 13 months and have a weather check.
    get degradationResult() { return this.memo('degradationResult', () => this.computeDegradationResult()); },
    computeDegradationResult() { return this.ready ? engine.degradationFor({ setup: this.s, bills: this.bills, resultOf: (b) => this.result(b) }) : null; },

    // Spread of the year-over-year pairs, as change in PR (ticket #45). Empty with one pair.
    get degradationSpread() {
      const d = this.degradationResult; if (!d || d.pairs < 2) return '';
      const ch = (loss) => `${loss >= 0 ? 'down' : 'up'} ${this.fmt(Math.abs(loss), 1)}%`;
      return `Single pairs range from ${ch(d.minLossPct)} to ${ch(d.maxLossPct)}. One month's sun data can be off by 5 to 10%, so the range stays wide until many months are paired.`;
    },

    // F9: sustained drop in round-trip efficiency against the owner's own first bills. null until 5 bills have one.
    get efficiencyTrend() { return this.memo('efficiencyTrend', () => this.computeEfficiencyTrend()); },
    computeEfficiencyTrend() { return engine.efficiencyFor({ setup: this.s, bills: this.bills, resultOf: (b) => this.result(b) }); },

    // F9: what the battery has earned over the bills entered, against its cost if given.
    get batteryTotal() { return this.memo('batteryTotal', () => this.computeBatteryTotal()); },
    computeBatteryTotal() { return engine.batteryTotalFor({ setup: this.s, bills: this.bills, resultOf: (b) => this.result(b) }); },

    // A missing month before this bill (calc.billGaps): shown on the later bill and on the sheet.
    get gaps() { return this.memo('gaps', () => this.computeGaps()); },
    computeGaps() { return calc.billGaps(this.bills); },
    gapBefore(b) { return this.gaps.find((g) => g.to === b.start) ?? null; },

    // Two consecutive red bills, oldest to newest, ending at this bill (worked out in buildModel).
    redRaised(b) { this.ver[b.id]; return (model ??= raw.buildModel()).red.has(b.id); },

    num,
    listAnd: (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]),
    decode(b) {
      const v = { importKwh: num(b.importKwh), exportKwh: num(b.exportKwh), ...this.charges(b), total: num(b.total) };
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
    get cumulative() { return this.memo('cumulative', () => this.computeCumulative()); },
    computeCumulative() { return engine.cumulativeSavings(this.bills, (b) => this.result(b)); },
    // Export credit left out of savings by the variable-charges cap, summed over bills with savings (audit M-3).
    get creditLeftOut() { return this.memo('creditLeftOut', () => this.computeCreditLeftOut()); },
    computeCreditLeftOut() { return engine.creditLeftOut(this.bills, (b) => this.result(b)); },
    // The savings curve and the chart's date axis start on the same bill: the first one with savings (ticket #44; the
    // axis used to start on the first bill with a date, so a bill without bill numbers shifted every date label).
    get startDate() { return this.memo('startDate', () => this.computeStartDate()); },
    computeStartDate() { return engine.savingsStart(this.bills, (b) => this.result(b)); },

    // Promised line: cost spread evenly over the promised years, from the first bill with savings.
    get promisedPerDay() { return engine.promisedPerDay(this.s); },

    get paybackStats() { return this.memo('paybackStats', () => this.computePaybackStats()); },
    computePaybackStats() { return engine.paybackStats({ setup: this.s, cumulative: this.cumulative, bills: this.bills, resultOf: (b) => this.result(b), minDays: PAYBACK_MIN_DAYS }); },
    // Tag on the pace tiles while early, worded for the season the bills actually cover.
    get earlyTag() {
      const t = this.paybackStats; if (!t?.early) return '';
      return { wet: 'Early: rainy months read low', dry: 'Early: sunny months read high', mixed: 'Early: under a year of bills' }[t.season];
    },
    get paybackText() {
      const t = this.paybackStats; if (!t) return '';
      // Early on, the tiles carry the numbers; this line only says why they will move.
      if (t.early) return `Based on ${this.fmt(t.days, 0)} days of bills. Savings rise and fall with the seasons, so the pace and the payback year will move until you have about a year of bills.`;
      let out = `Over ${this.fmt(t.days, 0)} days you saved ₱${this.fmt(t.saved, 0)}.`;
      if (t.promised !== null) out += ` At the promised pace you would have saved ₱${this.fmt(t.promised, 0)}, so you are ${this.fmt(Math.abs(t.gapPct), 0)}% ${t.gapPct >= 0 ? 'ahead' : 'behind'}.`;
      if (t.years !== null) out += ` At your pace so far the system pays itself back in about ${this.fmt(t.years, 1)} years${t.promisedYears ? `, against ${this.fmt(t.promisedYears, 1)} promised` : ''}.`;
      return out;
    },

    // Chart model: pixel positions in a 340 x 200 box, clean axis ticks, one point per bill.
    get chartModel() { return this.memo('chartModel', () => this.computeChartModel()); },
    computeChartModel() {
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
    // Share the site address only: the OS share sheet where the browser has one, else copy to the clipboard.
    shareMsg: '',
    async shareSite() {
      const url = 'https://myscnd.app/', text = 'A free, private check for Philippine rooftop solar, from your own bill and inverter app.';
      try {
        if (navigator.share) { await navigator.share({ title: 'SCND: your second meter', text, url }); return; }
        await navigator.clipboard.writeText(url); this.shareMsg = 'Link copied: ' + url;
      } catch (e) {
        if (e?.name !== 'AbortError') this.shareMsg = 'Could not share from this browser. The address is ' + url;
      }
    },
    introOpen: false,
    get landing() { return !this.ready && !this.started; },   // first screen: hero plus "What you get"

    openIntro() { this.introOpen = true; this.$nextTick(() => this.scrollTo('about')); },
    closeIntro() { this.introOpen = false; },
    init() {
      // Rebuild the bill results once per change to any input (ticket #39, see the note above `let model`).
      Alpine.effect(() => { this.inputKey(); this.refreshModel(); });
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
  }; return raw; });
});
